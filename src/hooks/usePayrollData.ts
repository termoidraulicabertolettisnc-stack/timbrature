import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { distributePayrollOvertime, applyPayrollOvertimeDistribution } from '@/utils/payrollOvertimeDistribution';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { 
  applyEntryToleranceToTimesheet, 
  determineAffectedDays, 
  calculateLunchBreakMinutes,
  calculateOrdinaryAndOvertime,
  hasValidSegmentDuration,
  getEffectiveTimezone
} from '@/utils/timesheetProcessing';

export interface PayrollData {
  employee_id: string;
  employee_name: string;
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
    absence_totals: { [absenceType: string]: number };
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
}

const fetchPayrollData = async (selectedMonth: string): Promise<PayrollData[]> => {
  const [year, month] = selectedMonth.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

  // Get all employees in the company first
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, company_id')
    .eq('is_active', true);

  if (profilesError) throw profilesError;

  const profiles = profilesData || [];
  const userIds = profiles.map(p => p.user_id);

  if (userIds.length === 0) {
    return [];
  }

  // Get timesheets for the period WITH sessions
  const { data: timesheets, error: timesheetError } = await supabase
    .from('timesheets')
    .select('*, timesheet_sessions(*)')
    .in('user_id', userIds)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_absence', false);

  if (timesheetError) throw timesheetError;

  // Get absences for the period
  const { data: absences, error: absenceError } = await supabase
    .from('employee_absences')
    .select('*')
    .in('user_id', userIds)
    .gte('date', startDate)
    .lte('date', endDate);

  if (absenceError) throw absenceError;

  // Get company settings for default values
  const { data: companySettings, error: companySettingsError } = await supabase
    .from('company_settings')
    .select('*')
    .in('company_id', profiles.map(p => p.company_id));

  if (companySettingsError) throw companySettingsError;

  // Process data by employee using temporal settings
  const processedData: PayrollData[] = await Promise.all(profiles.map(async (profile) => {
    const employeeTimesheets = (timesheets || []).filter(t => t.user_id === profile.user_id);
    const employeeAbsences = (absences || []).filter(a => a.user_id === profile.user_id);
    
    const dailyData: { [day: string]: { ordinary: number; overtime: number; absence: string | null } } = {};
    let totalOrdinary = 0;
    let totalOvertime = 0;
    let absenceTotals: { [absenceType: string]: number } = {};
    let mealVoucherDays = 0;
    
    // Get company settings for default values
    const companySettingsForEmployee = companySettings?.find(cs => cs.company_id === profile.company_id);
    const mealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.00;
    
    // Get effective timezone (hierarchy: company settings -> default)
    const timezone = getEffectiveTimezone(companySettingsForEmployee);

    // Initialize all days of the month
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayKey = String(day).padStart(2, '0');
      dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
    }

    // Import utilities for session splitting and temporal settings
    const { sessionsForDay } = await import('@/utils/timeSegments');
    const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
    const { BenefitsService } = await import('@/services/BenefitsService');

    // Process each timesheet once - determine which days it affects
    for (const ts of employeeTimesheets) {
      const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
      
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
        
        const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
        
        // Skip Saturday if configured as business trip
        if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
          continue;
        }

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
        totalOrdinary += ordinaryForDay;
        totalOvertime += overtimeForDay;
      }

      // DEBUG: Log timesheet data before meal benefits calculation
      console.log('📊 [PayrollData] Calcolo buoni pasto per timesheet:', {
        user_id: ts.user_id,
        date: processedTimesheet.date,
        start_time: processedTimesheet.start_time,
        end_time: processedTimesheet.end_time,
        temporalSettingsPolicy: temporalSettings?.meal_allowance_policy,
        temporalSettingsMealVoucherEnabled: temporalSettings?.meal_voucher_enabled,
        companyPolicy: companySettingsForEmployee?.meal_allowance_policy,
        companyMealVoucherEnabled: companySettingsForEmployee?.meal_voucher_enabled,
      });

      // Calculate meal benefits dynamically using BenefitsService (same as BusinessTripsDashboard)
      // This ensures consistency between the two dashboards
      const mealBenefits = await BenefitsService.calculateMealBenefits(
        { ...processedTimesheet, user_id: ts.user_id },
        temporalSettings ? {
          meal_allowance_policy: temporalSettings.meal_allowance_policy,
          meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
          daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
          lunch_break_type: temporalSettings.lunch_break_type,
          saturday_handling: temporalSettings.saturday_handling,
          meal_voucher_enabled: temporalSettings.meal_voucher_enabled,
        } : undefined,
        companySettingsForEmployee,
        processedTimesheet.date,
      );

      console.log('📊 [PayrollData] Risultato mealBenefits:', {
        mealVoucher: mealBenefits.mealVoucher,
        workedHours: mealBenefits.workedHours,
        date: processedTimesheet.date,
      });

      if (mealBenefits.mealVoucher) {
        mealVoucherDays++;
        console.log('📊 [PayrollData] ✅ Buono pasto contato! Totale:', mealVoucherDays);
      }
    }

    // Process absences
    employeeAbsences.forEach(abs => {
      const day = new Date(abs.date).getDate();
      const dayKey = String(day).padStart(2, '0');
      
      dailyData[dayKey].absence = abs.absence_type;
      
      // Track hours by absence type
      const absenceType = abs.absence_type;
      if (!absenceTotals[absenceType]) {
        absenceTotals[absenceType] = 0;
      }
      absenceTotals[absenceType] += abs.hours || 8;
    });

    // Apply overtime conversions (sync with BusinessTripsDashboard)
    let finalOvertimeTotal = totalOvertime;
    let finalDailyData = { ...dailyData };
    
    try {
      const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
        profile.user_id,
        selectedMonth,
        totalOvertime,
      );
      
      if (conversionCalc.converted_hours > 0) {
        // Apply overtime distribution to daily data
        const dailyDataForDistribution: { [day: string]: { ordinary: number; overtime: number; absence: string | null } } = {};
        Object.keys(dailyData).forEach(day => {
          dailyDataForDistribution[day] = {
            ordinary: dailyData[day].ordinary,
            overtime: dailyData[day].overtime,
            absence: dailyData[day].absence
          };
        });
        
        const distributions = distributePayrollOvertime(dailyDataForDistribution, conversionCalc.converted_hours);
        finalDailyData = applyPayrollOvertimeDistribution(dailyDataForDistribution, distributions);
        
        // Recalculate total overtime after conversions
        finalOvertimeTotal = Object.values(finalDailyData).reduce((sum, data) => sum + (data.overtime || 0), 0);
      }
    } catch (error) {
      console.error(`❌ Error applying overtime conversions for ${profile.first_name} ${profile.last_name}:`, error);
      // Continue with non-converted data - don't exclude employee from results
    }

    return {
      employee_id: profile.user_id,
      employee_name: `${profile.first_name} ${profile.last_name}`,
      daily_data: finalDailyData,
      totals: { 
        ordinary: totalOrdinary ?? 0, 
        overtime: finalOvertimeTotal ?? 0,
        absence_totals: absenceTotals ?? {} 
      },
      meal_vouchers: mealVoucherDays ?? 0,
      meal_voucher_amount: mealVoucherAmount ?? 8.00
    };
  }));

  return processedData;
};

export const usePayrollData = (selectedMonth: string) => {
  return useQuery({
    queryKey: ['payroll-data', selectedMonth],
    queryFn: () => fetchPayrollData(selectedMonth),
    staleTime: 5 * 60 * 1000, // 5 minutes - don't refetch before this
    gcTime: 10 * 60 * 1000, // 10 minutes - cache time (replaces deprecated cacheTime)
    refetchOnWindowFocus: false, // Don't refetch when user returns to window
    refetchOnMount: false, // Don't refetch on mount if data is fresh
  });
};
