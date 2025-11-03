import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toZonedTime } from 'date-fns-tz';
import { distributePayrollOvertime, applyPayrollOvertimeDistribution } from '@/utils/payrollOvertimeDistribution';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { applyEntryTolerance, shouldApplyEntryTolerance } from '@/utils/entryToleranceUtils';

const TZ = 'Europe/Rome';

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

    // Initialize all days of the month
    const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dayKey = String(day).padStart(2, '0');
      dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
    }

    // Import utilities for session splitting
    const { sessionsForDay } = await import('@/utils/timeSegments');
    const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
    const { calculateMealBenefitsTemporal } = await import('@/utils/mealBenefitsCalculator');

    // Process each timesheet once - determine which days it affects
    for (const ts of employeeTimesheets) {
      const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
      
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
            const startDay = `${sessionStart.getFullYear()}-${String(sessionStart.getMonth() + 1).padStart(2, '0')}-${String(sessionStart.getDate()).padStart(2, '0')}`;
            const endDay = `${sessionEnd.getFullYear()}-${String(sessionEnd.getMonth() + 1).padStart(2, '0')}-${String(sessionEnd.getDate()).padStart(2, '0')}`;
            
            // Add all days between start and end (inclusive)
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
        // Legacy format - use timesheet start/end with ZONED dates (with tolerance applied)
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

      // Calculate meal vouchers (only for primary date, use processed timesheet)
      const primaryDayKey = String(new Date(`${processedTimesheet.date}T00:00:00`).getDate()).padStart(2, '0');
      const mealBenefits = await calculateMealBenefitsTemporal(
        processedTimesheet,
        temporalSettings ? {
          meal_allowance_policy: temporalSettings.meal_allowance_policy,
          meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
          daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
          lunch_break_type: temporalSettings.lunch_break_type
        } : undefined,
        companySettingsForEmployee,
        processedTimesheet.date
      );

      if (mealBenefits.mealVoucher) {
        mealVoucherDays++;
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
      console.error('Error applying overtime conversions for employee:', profile.user_id, error);
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
