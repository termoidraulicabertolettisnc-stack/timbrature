import { supabase } from '@/integrations/supabase/client';
import { getEmployeeSettingsForDate } from '@/utils/temporalEmployeeSettings';

export interface WorkingDaysResult {
  totalWorkingDays: number;
  actualWorkingDays: number; // Days with actual hours worked
  businessTripDays: number; // Saturday business trips
}

/**
 * Calculates working days for an employee in a given month
 * @param userId - Employee user ID
 * @param month - Month in format YYYY-MM
 * @param timesheets - Optional pre-loaded timesheets data
 * @returns WorkingDaysResult with breakdown of working days
 */
export async function calculateWorkingDays(
  userId: string,
  month: string,
  timesheets?: any[]
): Promise<WorkingDaysResult> {
  const [year, monthStr] = month.split('-');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-${new Date(parseInt(year), parseInt(monthStr), 0).getDate()}`;
  
  // Fetch timesheets if not provided
  let employeeTimesheets = timesheets;
  if (!employeeTimesheets) {
    const { data: timesheetData, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_absence', false);
    
    if (error) throw error;
    employeeTimesheets = timesheetData || [];
  } else {
    // Filter timesheets for this user and month
    employeeTimesheets = timesheets.filter(ts => 
      ts.user_id === userId && 
      ts.date >= startDate && 
      ts.date <= endDate &&
      !ts.is_absence
    );
  }

  let actualWorkingDays = 0;
  let businessTripDays = 0;
  
  // Process each timesheet to count working days
  for (const ts of employeeTimesheets) {
    const totalHours = ts.total_hours || 0;
    if (totalHours <= 0) continue;
    
    const date = new Date(ts.date);
    const isSaturday = date.getDay() === 6;
    
    // Get temporal settings for this specific date
    const temporalSettings = await getEmployeeSettingsForDate(userId, ts.date);
    
    // Get company settings for fallback
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', userId)
      .single();
    
    let saturdayHandling = 'straordinario';
    if (temporalSettings?.saturday_handling) {
      saturdayHandling = temporalSettings.saturday_handling;
    } else if (profile?.company_id) {
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('saturday_handling')
        .eq('company_id', profile.company_id)
        .single();
      
      if (companySettings?.saturday_handling) {
        saturdayHandling = companySettings.saturday_handling;
      }
    }
    
    if (isSaturday && saturdayHandling === 'trasferta') {
      // Saturday as business trip - count as business trip day
      businessTripDays++;
    } else {
      // Regular working day (including Saturday as overtime)
      actualWorkingDays++;
    }
  }
  
  const totalWorkingDays = actualWorkingDays + businessTripDays;
  
  return {
    totalWorkingDays,
    actualWorkingDays,
    businessTripDays
  };
}