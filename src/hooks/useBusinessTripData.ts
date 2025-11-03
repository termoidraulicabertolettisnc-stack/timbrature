import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toZonedTime } from 'date-fns-tz';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { useAuth } from '@/contexts/AuthContext';
import { applyEntryTolerance, shouldApplyEntryTolerance } from '@/utils/entryToleranceUtils';

const TZ = 'Europe/Rome';

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

  // Multi-tenant safety: scope by current user's company
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (meError) throw meError;

  // Fetch holidays for the selected month
  const { data: holidayData, error: holidayError } = await supabase
    .from('company_holidays')
    .select('date')
    .eq('company_id', me!.company_id)
    .gte('date', startDate)
    .lte('date', endDate);
  
  if (holidayError) {
    console.warn('Error fetching holidays:', holidayError);
  }
  
  const holidayDates = holidayData?.map(h => h.date) || [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, company_id')
    .eq('is_active', true)
    .eq('company_id', me!.company_id);
  if (profilesError) throw profilesError;

  const profiles = profilesData || [];
  const userIds = profiles.map((p) => p.user_id);
  if (userIds.length === 0) {
    return { data: [], holidays: holidayDates };
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

  // Build simplified per-employee dataset
  const processedData: BusinessTripData[] = await Promise.all(
    profiles.map(async (profile) => {
      const employeeTimesheets = (timesheets || []).filter((t) => t.user_id === profile.user_id);
      const employeeAbsences = (absences || []).filter((a) => a.user_id === profile.user_id);
      const companySettingsForEmployee = companySettings?.find((cs) => cs.company_id === profile.company_id);
      const employeeConversions = allConversionsData[profile.user_id] || [];

      const dailyData: BusinessTripData['daily_data'] = {};
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
        saturdayTrips.daily_data[dayKey] = 0;
        dailyAllowances.daily_data[dayKey] = false;
        mealVoucherConversions.daily_data[dayKey] = false;
        mealVouchersDaily[dayKey] = false;
        dailyAllowanceAmounts[dayKey] = 0;
      }

      const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
      const defaultMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.0;

      // Import session splitting utility
      const { sessionsForDay } = await import('@/utils/timeSegments');

      // Process each timesheet once - determine which days it affects
      for (const ts of employeeTimesheets) {
        const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
        const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
        const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;

        // ✅ Apply entry tolerance BEFORE calculating hours
        let processedTimesheet = { ...ts };
        const toleranceConfig = shouldApplyEntryTolerance(temporalSettings, companySettingsForEmployee);
        
        // Check if we have sessions (new format) or legacy format
        if (processedTimesheet.timesheet_sessions && processedTimesheet.timesheet_sessions.length > 0) {
          // Apply tolerance to the first session's start time
          if (toleranceConfig.enabled && toleranceConfig.standardTime && toleranceConfig.tolerance !== undefined) {
            const sortedSessions = [...processedTimesheet.timesheet_sessions].sort((a, b) => 
              (a.session_order || 0) - (b.session_order || 0)
            );
            
            if (sortedSessions.length > 0 && sortedSessions[0].start_time) {
              const adjustedStartTime = applyEntryTolerance(
                new Date(sortedSessions[0].start_time),
                toleranceConfig.standardTime,
                toleranceConfig.tolerance
              );
              // Create a new sessions array with the adjusted first session
              processedTimesheet.timesheet_sessions = sortedSessions.map((session, idx) => 
                idx === 0 
                  ? { ...session, start_time: adjustedStartTime.toISOString() }
                  : session
              );
            }
          }
        } else if (processedTimesheet.start_time) {
          // Legacy format - apply tolerance to main timesheet start_time
          if (toleranceConfig.enabled && toleranceConfig.standardTime && toleranceConfig.tolerance !== undefined) {
            const adjustedStartTime = applyEntryTolerance(
              new Date(processedTimesheet.start_time),
              toleranceConfig.standardTime,
              toleranceConfig.tolerance
            );
            processedTimesheet.start_time = adjustedStartTime.toISOString();
          }
        }

        // Determine which days this timesheet affects
        const affectedDays = new Set<string>();
        
        // Check if we have sessions (new format) or legacy format
        if (processedTimesheet.timesheet_sessions && processedTimesheet.timesheet_sessions.length > 0) {
          // New format with sessions
          for (const session of processedTimesheet.timesheet_sessions) {
            if (session.start_time && session.end_time) {
              // Convert UTC to local timezone to determine which local days are affected
              const sessionStart = toZonedTime(new Date(session.start_time), TZ);
              const sessionEnd = toZonedTime(new Date(session.end_time), TZ);
              
              // Extract local date using local methods (NOT .toISOString() which uses UTC)
              let currentDate = new Date(sessionStart);
              currentDate.setHours(0, 0, 0, 0);
              const endDate = new Date(sessionEnd);
              endDate.setHours(0, 0, 0, 0);
              
              while (currentDate <= endDate) {
                const dayISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                if (dayISO >= `${year}-${month}-01` && dayISO <= `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`) {
                  affectedDays.add(dayISO);
                }
                currentDate.setDate(currentDate.getDate() + 1);
              }
            }
          }
        } else if (processedTimesheet.start_time && processedTimesheet.end_time) {
          // Legacy format with ZONED dates (with tolerance applied)
          const startDate = toZonedTime(new Date(processedTimesheet.start_time), TZ);
          const endDate = toZonedTime(new Date(processedTimesheet.end_time), TZ);
          
          let currentDate = new Date(startDate);
          currentDate.setHours(0, 0, 0, 0);
          const endDateNormalized = new Date(endDate);
          endDateNormalized.setHours(0, 0, 0, 0);
          
          while (currentDate <= endDateNormalized) {
            const dayISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
            if (dayISO >= `${year}-${month}-01` && dayISO <= `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`) {
              affectedDays.add(dayISO);
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
        
        // Fallback: if no days were added (sessions without times), use timesheet.date
        if (affectedDays.size === 0) {
          affectedDays.add(processedTimesheet.date);
        }

        // Process each affected day (use processedTimesheet with tolerance applied)
        for (const dayISO of affectedDays) {
          const segments = sessionsForDay(processedTimesheet, dayISO);
          if (segments.length === 0) continue;

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

          // ✅ Subtract lunch break if applicable
          // If there's only one session, we need to subtract the lunch break
          // If there are multiple sessions, the lunch break is already incorporated in the gap
          if (segments.length === 1 && processedTimesheet.lunch_duration_minutes && processedTimesheet.lunch_duration_minutes > 0) {
            dayHours -= processedTimesheet.lunch_duration_minutes / 60;
          } else if (segments.length === 1 && processedTimesheet.lunch_start_time && processedTimesheet.lunch_end_time) {
            const lunchStart = new Date(processedTimesheet.lunch_start_time);
            const lunchEnd = new Date(processedTimesheet.lunch_end_time);
            if (!isNaN(lunchStart.getTime()) && !isNaN(lunchEnd.getTime())) {
              dayHours -= (lunchEnd.getTime() - lunchStart.getTime()) / (1000 * 60 * 60);
            }
          } else if (segments.length === 1 && dayHours > 6) {
            // Apply default lunch break from settings only if no explicit lunch break
            if (!processedTimesheet.lunch_duration_minutes && !processedTimesheet.lunch_start_time) {
              const lunchBreakType = temporalSettings?.lunch_break_type || companySettingsForEmployee?.lunch_break_type || '60_minuti';
              if (lunchBreakType !== '0_minuti' && lunchBreakType !== 'libera') {
                const lunchMinutes = parseInt(lunchBreakType.split('_')[0]) || 60;
                dayHours -= lunchMinutes / 60;
              }
            }
          }

          dayHours = Math.max(0, dayHours);

          if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
            // Saturday as business trip
            saturdayTrips.hours += dayHours;
            saturdayTrips.amount += dayHours * effectiveSaturdayRate;
            saturdayTrips.daily_data[dayKey] += dayHours;
          } else {
            // ✅ Always recalculate ordinary and overtime based on dayHours vs contractualHours
            // This ensures lunch breaks are properly accounted for
            const dayOfWeek = date.getDay();
            const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
            const dayKey_it = dayNames[dayOfWeek];
            const contractualHours = (temporalSettings?.standard_weekly_hours?.[dayKey_it] ?? 
                                     companySettingsForEmployee?.standard_weekly_hours?.[dayKey_it] ?? 
                                     8) as number;
            
            // Recalculate ordinary and overtime based on segments
            const ordinaryForDay = Math.min(dayHours, contractualHours);
            const overtimeForDay = Math.max(0, dayHours - contractualHours);
            
            dailyData[dayKey].ordinary += ordinaryForDay;
            dailyData[dayKey].overtime += overtimeForDay;
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

        // Meal voucher conversions
        const isConverted = employeeConversions.some(conv => conv.date === processedTimesheet.date && conv.converted_to_allowance);
        if (isConverted) {
          mealVoucherConversions.days += 1;
          mealVoucherConversions.daily_data[primaryDayKey] = true;
          mealVoucherConversions.amount += defaultMealVoucherAmount;
        }
      }

      // Process absences
      for (const abs of employeeAbsences) {
        const day = new Date(`${abs.date}T00:00:00`).getDate();
        const dayKey = String(day).padStart(2, '0');
        dailyData[dayKey].absence = abs.absence_type;
        if (!absenceTotals[abs.absence_type]) absenceTotals[abs.absence_type] = 0;
        absenceTotals[abs.absence_type] += abs.hours || 8;
      }

      // Calculate overtime conversions (monthly) - NON modificano i dati visualizzati
      let overtimeConversions = {
        hours: 0,
        amount: 0,
        monthly_total: false
      };

      try {
        const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
          profile.user_id,
          selectedMonth,
          totalOvertime,
        );
        
        if (conversionCalc.converted_hours > 0) {
          overtimeConversions.hours = conversionCalc.converted_hours;
          overtimeConversions.amount = conversionCalc.conversion_amount;
          overtimeConversions.monthly_total = true;
        }
      } catch (e) {
        console.warn('Conversion calc error', profile.user_id, e);
      }

      return {
        employee_id: profile.user_id,
        employee_name: `${profile.first_name} ${profile.last_name}`,
        company_id: profile.company_id,
        daily_data: dailyData,
        totals: {
          ordinary: totalOrdinary,
          overtime: totalOvertime,
          absence_totals: absenceTotals,
        },
        meal_vouchers: mealVoucherDays,
        meal_voucher_amount: mealVoucherDays * defaultMealVoucherAmount,
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

  return { data: processedData, holidays: holidayDates };
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
