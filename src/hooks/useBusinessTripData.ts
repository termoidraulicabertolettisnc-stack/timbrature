import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { getHolidayDates } from '@/services/ItalianHolidaysService';
import { useAuth } from '@/contexts/AuthContext';
import { applyMonthlyOvertimeCompensation } from '@/utils/monthlyOvertimeCompensation';
import { 
  applyEntryToleranceToTimesheet, 
  determineAffectedDays, 
  calculateLunchBreakMinutes,
  calculateOrdinaryAndOvertime,
  hasValidSegmentDuration,
  getEffectiveTimezone
} from '@/utils/timesheetProcessing';

export interface BusinessTripData {
  employee_id: string;
  employee_name: string;
  company_id: string;
  daily_data: {
    [day: string]: {
      ordinary: number;
      overtime: number;
      absence: string | null;
    };
  };
  totals: {
    ordinary: number;
    overtime: number;
    absence_totals: Record<string, number>;
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
  saturday_trips: {
    hours: number;
    amount: number;
    daily_data: { [day: string]: number };
  };
  daily_allowances: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean };
  };
  overtime_conversions: {
    hours: number;
    amount: number;
    monthly_total: boolean;
  };
  meal_voucher_conversions: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean };
  };
  meal_vouchers_daily_data: { [day: string]: boolean };
  daily_allowances_amounts: { [day: string]: number };
  saturday_rate: number;
}

const fetchBusinessTripData = async (selectedMonth: string, userId: string): Promise<{ data: BusinessTripData[], holidays: string[] }> => {
  const [year, month] = selectedMonth.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

  // Check if user is admin
  const { data: isAdmin } = await supabase.rpc('is_admin');

  // Get current user's company for holidays (used as fallback for city)
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('company_id, companies(city)')
    .eq('user_id', userId)
    .single();
  if (meError) throw meError;

  // Get company city for patron saint holiday
  const companyCity = (me as any)?.companies?.city as string | undefined;

  // Get holidays using the Italian holidays service (includes national + patron saint)
  const holidayDates = getHolidayDates(parseInt(year), companyCity).filter(
    date => date >= startDate && date <= endDate
  );

  // For admins: load all active employees; for regular users: only their company
  let profilesQuery = supabase
    .from('profiles')
    .select('user_id, first_name, last_name, company_id')
    .eq('is_active', true);
  
  if (!isAdmin) {
    profilesQuery = profilesQuery.eq('company_id', me!.company_id);
  }

  const { data: profilesData, error: profilesError } = await profilesQuery;
  if (profilesError) throw profilesError;

  const profiles = profilesData || [];
  const userIds = profiles.map((p) => p.user_id);
  
  // Get unique company IDs for fetching holidays
  const uniqueCompanyIds = [...new Set(profiles.map(p => p.company_id))];
  
  // Fetch manual holidays for all relevant companies
  const { data: manualHolidayData, error: holidayError } = await supabase
    .from('company_holidays')
    .select('date')
    .in('company_id', uniqueCompanyIds.length > 0 ? uniqueCompanyIds : [me!.company_id])
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (holidayError) {
    console.warn('Error fetching manual holidays:', holidayError);
  }
  
  // Merge automatic and manual holidays
  const manualHolidays = manualHolidayData?.map(h => h.date) || [];
  const allHolidayDates = [...new Set([...holidayDates, ...manualHolidays])];

  if (userIds.length === 0) {
    return { data: [], holidays: allHolidayDates };
  }

  const { data: timesheets, error: timesheetError } = await supabase
    .from('timesheets')
    .select('*, timesheet_sessions(*)')
    .in('user_id', userIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_absence', false);
  if (timesheetError) throw timesheetError;

  const { data: absences, error: absenceError } = await supabase
    .from('employee_absences')
    .select('*')
    .in('user_id', userIds)
    .gte('date', startDate)
    .lte('date', endDate);
  if (absenceError) throw absenceError;

  const { data: companySettings, error: companySettingsError } = await supabase
    .from('company_settings')
    .select('*')
    .in('company_id', profiles.map((p) => p.company_id));
  if (companySettingsError) throw companySettingsError;

  // Import services
  const [{ getEmployeeSettingsForDate }, { BenefitsService }, { MealVoucherConversionService }] = await Promise.all([
    import('@/utils/temporalEmployeeSettings'),
    import('@/services/BenefitsService'),
    import('@/services/MealVoucherConversionService'),
  ]);

  // Load all meal voucher conversions for the period
  const allConversionsData = await MealVoucherConversionService.getConversionsForUsers(userIds, startDate, endDate);

  // Get employee settings for monthly compensation check
  const { data: employeeSettingsData } = await supabase
    .from('employee_settings')
    .select('user_id, overtime_monthly_compensation, valid_from, valid_to')
    .in('user_id', userIds);

  // Build simplified per-employee dataset
  const processedData: BusinessTripData[] = await Promise.all(
    profiles.map(async (profile) => {
      const employeeTimesheets = (timesheets || []).filter((t) => t.user_id === profile.user_id);
      const employeeAbsences = (absences || []).filter((a) => a.user_id === profile.user_id);
      const companySettingsForEmployee = companySettings?.find((cs) => cs.company_id === profile.company_id);
      const employeeConversions = allConversionsData[profile.user_id] || [];

      // Check if employee has monthly overtime compensation enabled
      const employeeSetting = employeeSettingsData?.find(es => 
        es.user_id === profile.user_id && 
        (es.valid_from === null || es.valid_from <= endDate) &&
        (es.valid_to === null || es.valid_to >= startDate)
      );
      const hasMonthlyOvertimeCompensation = employeeSetting?.overtime_monthly_compensation === true;

      const dailyData: BusinessTripData['daily_data'] = {};
      // Track contracted hours per day for deficit calculation
      const dailyContractedHours: { [day: string]: number } = {};
      let totalOrdinary = 0;
      let totalOvertime = 0;
      let absenceTotals: Record<string, number> = {};
      let mealVoucherDays = 0;

      // Initialize separate business trip types
      const saturdayTrips = {
        hours: 0,
        amount: 0,
        daily_data: {} as { [day: string]: number }
      };

      const dailyAllowances = {
        days: 0,
        amount: 0,
        daily_data: {} as { [day: string]: boolean }
      };

      const mealVoucherConversions = {
        days: 0,
        amount: 0,
        daily_data: {} as { [day: string]: boolean }
      };

      const mealVouchersDaily: { [day: string]: boolean } = {};
      const dailyAllowanceAmounts: { [day: string]: number } = {};

      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
        dailyContractedHours[dayKey] = 0;
        saturdayTrips.daily_data[dayKey] = 0;
        dailyAllowances.daily_data[dayKey] = false;
        mealVoucherConversions.daily_data[dayKey] = false;
        mealVouchersDaily[dayKey] = false;
        dailyAllowanceAmounts[dayKey] = 0;
      }

      const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
      // NOTE: mealVoucherAmount will be calculated per-employee using temporal settings
      const companyMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.0;
      
      // Get effective timezone (hierarchy: company settings -> default)
      const timezone = getEffectiveTimezone(companySettingsForEmployee);

      // Import session splitting utility
      const { sessionsForDay } = await import('@/utils/timeSegments');

      // Process each timesheet once - determine which days it affects
      for (const ts of employeeTimesheets) {
        const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
        const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
        const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;

        // Apply entry tolerance BEFORE calculating hours (hierarchy: day -> employee -> company -> defaults)
        const processedTimesheet = applyEntryToleranceToTimesheet(ts, temporalSettings, companySettingsForEmployee);

        // Determine which days this timesheet affects
        const affectedDays = determineAffectedDays(processedTimesheet, year, month, timezone);

        // Process each affected day (use processedTimesheet with tolerance applied)
        for (const dayISO of affectedDays) {
          const segments = sessionsForDay(processedTimesheet, dayISO);
          
          // Skip if no valid segments or if all segments have 0 duration
          if (!hasValidSegmentDuration(segments)) continue;

          const date = new Date(`${dayISO}T00:00:00`);
          const dayKey = String(date.getDate()).padStart(2, '0');
          const isSaturday = date.getDay() === 6;

          // Calculate hours from segments
          let dayHours = 0;
          for (const seg of segments) {
            const startTime = new Date(seg.startUtc);
            const endTime = new Date(seg.endUtc);
            dayHours += (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          }

          // Subtract lunch break (hierarchy: explicit lunch -> manual lunch -> default lunch)
          const lunchMinutes = calculateLunchBreakMinutes(processedTimesheet, dayHours, temporalSettings, companySettingsForEmployee);
          dayHours = Math.max(0, dayHours - (lunchMinutes / 60));

          if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
            // Saturday as business trip
            saturdayTrips.hours += dayHours;
            saturdayTrips.amount += dayHours * effectiveSaturdayRate;
            saturdayTrips.daily_data[dayKey] += dayHours;
          } else {
            // Calculate ordinary and overtime (hierarchy: employee settings -> company settings -> defaults)
            const dayOfWeek = date.getDay();
            const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
            const dayKey_it = dayNames[dayOfWeek];
            const contractualHours = (temporalSettings?.standard_weekly_hours?.[dayKey_it] ?? 
                                     companySettingsForEmployee?.standard_weekly_hours?.[dayKey_it] ?? 
                                     8) as number;
            
            const { ordinary: ordinaryForDay, overtime: overtimeForDay } = calculateOrdinaryAndOvertime(dayHours, contractualHours);
            
            dailyData[dayKey].ordinary += ordinaryForDay;
            dailyData[dayKey].overtime += overtimeForDay;
            // Track contracted hours for this day (for deficit calculation)
            dailyContractedHours[dayKey] = contractualHours;
            totalOrdinary += ordinaryForDay;
            totalOvertime += overtimeForDay;
          }
        }

        // Calculate meal benefits (only for primary date, use processed timesheet)
        const primaryDayKey = String(new Date(`${processedTimesheet.date}T00:00:00`).getDate()).padStart(2, '0');
        const mealBenefits = await BenefitsService.calculateMealBenefits(
          processedTimesheet,
          temporalSettings ? {
            meal_allowance_policy: temporalSettings.meal_allowance_policy,
            meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
            daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
            lunch_break_type: temporalSettings.lunch_break_type,
            saturday_handling: temporalSettings.saturday_handling,
          } : undefined,
          companySettingsForEmployee,
          processedTimesheet.date,
        );

        // Daily allowance
        if (mealBenefits.dailyAllowance) {
          dailyAllowances.days += 1;
          dailyAllowances.daily_data[primaryDayKey] = true;
          const effectiveDailyAllowanceAmount = mealBenefits.dailyAllowanceAmount 
            || temporalSettings?.daily_allowance_amount 
            || companySettingsForEmployee?.default_daily_allowance_amount 
            || 10;
          dailyAllowances.amount += effectiveDailyAllowanceAmount;
          dailyAllowanceAmounts[primaryDayKey] = effectiveDailyAllowanceAmount;
        }

        // Meal voucher (non converted)
        if (mealBenefits.mealVoucher) {
          mealVoucherDays++;
          if (!employeeConversions.some(conv => conv.date === processedTimesheet.date && conv.converted_to_allowance)) {
            mealVouchersDaily[primaryDayKey] = true;
          }
        }

        // Meal voucher conversions - use employee settings amount if available
        const isConverted = employeeConversions.some(conv => conv.date === processedTimesheet.date && conv.converted_to_allowance);
        if (isConverted) {
          mealVoucherConversions.days += 1;
          mealVoucherConversions.daily_data[primaryDayKey] = true;
          const effectiveMealVoucherAmountForConversion = temporalSettings?.meal_voucher_amount ?? companyMealVoucherAmount;
          mealVoucherConversions.amount += effectiveMealVoucherAmountForConversion;
        }
      }

      // Process absences
      let compensableAbsenceHours = 0; // Ore di assenza compensabili (escluse malattie/infortuni)
      
      for (const abs of employeeAbsences) {
        const day = new Date(`${abs.date}T00:00:00`).getDate();
        const dayKey = String(day).padStart(2, '0');
        dailyData[dayKey].absence = abs.absence_type;
        if (!absenceTotals[abs.absence_type]) absenceTotals[abs.absence_type] = 0;
        const absenceHours = abs.hours || 8;
        absenceTotals[abs.absence_type] += absenceHours;
        
        // Accumulate compensable absence hours (exclude malattia=M and infortunio=I)
        if (abs.absence_type !== 'M' && abs.absence_type !== 'I') {
          compensableAbsenceHours += absenceHours;
        }
      }

      // COMPENSAZIONE STRAORDINARI MENSILE
      // Per dipendenti con overtime_monthly_compensation = true:
      // Gli straordinari vengono compensati con il DEFICIT di ore (ore contrattuali - ore ordinarie lavorate)
      // Le ore ordinarie in deficit vengono "riempite" con le ore di straordinario
      let finalOvertimeTotal = totalOvertime;
      let finalTotalOrdinary = totalOrdinary;
      let finalDailyData = { ...dailyData };
      
      if (hasMonthlyOvertimeCompensation && totalOvertime > 0) {
        const compensationResult = applyMonthlyOvertimeCompensation(
          dailyData,
          dailyContractedHours,
          compensableAbsenceHours
        );
        
        finalDailyData = compensationResult.dailyData;
        finalTotalOrdinary = compensationResult.totalOrdinary;
        finalOvertimeTotal = compensationResult.totalOvertime;
        
        // Remove absences from fully compensated days
        // When a day's deficit is fully covered by overtime, the absence should not be shown/counted
        const compensableAbsenceTypes = ['F', 'FS', 'PR', 'PNR', 'A']; // Exclude M (malattia) and I (infortunio)
        
        for (const dayKey of compensationResult.fullyCompensatedDays) {
          const absence = finalDailyData[dayKey]?.absence;
          if (absence && compensableAbsenceTypes.includes(absence)) {
            // Find the corresponding absence to get its hours
            const absenceDate = `${year}-${month}-${dayKey}`;
            const matchingAbsence = employeeAbsences.find(
              abs => abs.date === absenceDate && abs.absence_type === absence
            );
            const absenceHours = matchingAbsence?.hours || 8;
            
            // Remove from totals
            if (absenceTotals[absence]) {
              absenceTotals[absence] -= absenceHours;
              if (absenceTotals[absence] <= 0) {
                delete absenceTotals[absence];
              }
            }
            
            // Clear the absence from the day
            finalDailyData[dayKey].absence = null;
            
            console.log(`🔄 [BusinessTripData] Rimossa assenza ${absence} dal giorno ${dayKey} (completamente compensato)`);
          }
        }
        
        // Create automatic absences for residual deficit days (PR = Permesso Retribuito)
        for (const { day, deficit } of compensationResult.residualDeficitDays) {
          // Only create absence if no absence already exists for this day
          if (!finalDailyData[day]?.absence && deficit > 0) {
            finalDailyData[day].absence = 'PR';
            
            // Add to absence totals
            if (!absenceTotals['PR']) {
              absenceTotals['PR'] = 0;
            }
            absenceTotals['PR'] += deficit;
            
            console.log(`🔄 [BusinessTripData] Creata assenza automatica PR per giorno ${day} (deficit residuo: ${deficit}h)`);
          }
        }
        
        console.log(`🔄 [BusinessTripData] Compensazione mensile per ${profile.first_name} ${profile.last_name}:`, {
          hasMonthlyOvertimeCompensation,
          originalOrdinary: totalOrdinary,
          originalOvertime: totalOvertime,
          ...compensationResult.compensationDetails,
          fullyCompensatedDays: compensationResult.fullyCompensatedDays,
          residualDeficitDays: compensationResult.residualDeficitDays,
          finalOrdinary: finalTotalOrdinary,
          finalOvertime: finalOvertimeTotal,
          absenceTotalsAfter: absenceTotals
        });
      }

      // Calculate overtime conversions (monthly) - for economic compensation (manual conversions)
      let overtimeConversions = {
        hours: 0,
        amount: 0,
        monthly_total: false
      };

      try {
        const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
          profile.user_id,
          selectedMonth,
          finalOvertimeTotal, // Use the already-compensated overtime
        );
        
        if (conversionCalc.converted_hours > 0) {
          overtimeConversions.hours = conversionCalc.converted_hours;
          overtimeConversions.amount = conversionCalc.conversion_amount;
          overtimeConversions.monthly_total = true;
        }
      } catch (error) {
        console.error(`❌ Error calculating overtime conversions for ${profile.first_name} ${profile.last_name}:`, error);
        // Continue with empty overtimeConversions - don't exclude employee from results
      }

      // Calculate effective meal voucher amount respecting hierarchy: employee settings -> company settings -> default
      const latestEmployeeSettings = await getEmployeeSettingsForDate(profile.user_id, endDate);
      const effectiveMealVoucherAmount = latestEmployeeSettings?.meal_voucher_amount ?? companyMealVoucherAmount;

      console.log('💰 [BusinessTripData] Importo buono pasto per', profile.first_name, profile.last_name, ':', {
        employeeAmount: latestEmployeeSettings?.meal_voucher_amount,
        companyAmount: companyMealVoucherAmount,
        effectiveAmount: effectiveMealVoucherAmount,
        mealVoucherDays,
      });

      return {
        employee_id: profile.user_id,
        employee_name: `${profile.first_name} ${profile.last_name}`,
        company_id: profile.company_id,
        daily_data: finalDailyData,
        totals: {
          ordinary: finalTotalOrdinary,
          overtime: finalOvertimeTotal,
          absence_totals: absenceTotals,
        },
        meal_vouchers: mealVoucherDays,
        meal_voucher_amount: mealVoucherDays * effectiveMealVoucherAmount,
        saturday_trips: saturdayTrips,
        daily_allowances: dailyAllowances,
        overtime_conversions: overtimeConversions,
        meal_voucher_conversions: mealVoucherConversions,
        meal_vouchers_daily_data: mealVouchersDaily,
        daily_allowances_amounts: dailyAllowanceAmounts,
        saturday_rate: defaultSaturdayRate,
      };
    })
  );

  return { data: processedData, holidays: allHolidayDates };
};

export const useBusinessTripData = (selectedMonth: string) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['business-trip-data', selectedMonth, user?.id],
    queryFn: () => fetchBusinessTripData(selectedMonth, user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes - don't refetch before this
    gcTime: 10 * 60 * 1000, // 10 minutes - cache time (replaces deprecated cacheTime)
    refetchOnWindowFocus: false, // Don't refetch when user returns to window
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  });
};
