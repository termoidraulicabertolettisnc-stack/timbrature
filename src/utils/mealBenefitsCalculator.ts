interface TimesheetData {
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  lunch_duration_minutes: number | null;
  total_hours: number | null;
}

interface EmployeeSettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  daily_allowance_min_hours?: number;
  lunch_break_type?: string;
}

interface CompanySettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  default_daily_allowance_min_hours?: number;
  lunch_break_type?: string;
}

interface MealBenefits {
  mealVoucher: boolean;
  dailyAllowance: boolean;
  workedHours: number;
}

/**
 * Centralized calculation for meal benefits (vouchers and daily allowances)
 * This is the single source of truth for meal benefit calculations
 */
export function calculateMealBenefits(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): MealBenefits {
  // Calculate worked hours
  const workedHours = calculateWorkedHours(timesheet, employeeSettings, companySettings);
  
  if (workedHours === 0) {
    return { mealVoucher: false, dailyAllowance: false, workedHours: 0 };
  }

  // Determine effective policy
  const policy = employeeSettings?.meal_allowance_policy || 
                 companySettings?.meal_allowance_policy || 
                 'disabled';

  if (policy === 'disabled') {
    return { mealVoucher: false, dailyAllowance: false, workedHours };
  }

  // Get minimum hours requirements
  const mealVoucherMinHours = employeeSettings?.meal_voucher_min_hours || 
                              companySettings?.meal_voucher_min_hours || 
                              6;
  
  const dailyAllowanceMinHours = employeeSettings?.daily_allowance_min_hours || 
                                 companySettings?.default_daily_allowance_min_hours || 
                                 6;

  // Check if minimum hours are met
  const meetsMealVoucherMinimum = workedHours >= mealVoucherMinHours;
  const meetsDailyAllowanceMinimum = workedHours >= dailyAllowanceMinHours;

  // Calculate benefits based on policy
  const mealVoucher = (policy === 'meal_vouchers_only' || policy === 'both') && meetsMealVoucherMinimum;
  const dailyAllowance = (policy === 'daily_allowance' || policy === 'both') && meetsDailyAllowanceMinimum;

  return { mealVoucher, dailyAllowance, workedHours };
}

/**
 * Calculate worked hours for a timesheet
 */
function calculateWorkedHours(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): number {
  if (!timesheet.start_time || !timesheet.end_time) {
    return 0;
  }

  const startTime = new Date(timesheet.start_time);
  const endTime = new Date(timesheet.end_time);
  
  if (!startTime || !endTime || isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    return 0;
  }

  // Calculate base duration
  let diffHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  
  // Handle lunch break
  let lunchBreakHours = 0;
  
  if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
    // Explicit lunch times
    const lunchStart = new Date(timesheet.lunch_start_time);
    const lunchEnd = new Date(timesheet.lunch_end_time);
    if (lunchStart && lunchEnd && !isNaN(lunchStart.getTime()) && !isNaN(lunchEnd.getTime())) {
      lunchBreakHours = (lunchEnd.getTime() - lunchStart.getTime()) / (1000 * 60 * 60);
    }
  } else if (timesheet.lunch_duration_minutes && timesheet.lunch_duration_minutes > 0) {
    // Explicit lunch duration
    lunchBreakHours = timesheet.lunch_duration_minutes / 60;
  } else if (diffHours > 6) {
    // Default lunch break based on settings
    const lunchBreakType = employeeSettings?.lunch_break_type || 
                          companySettings?.lunch_break_type || 
                          '60_minuti';
    const lunchMinutes = parseInt(lunchBreakType.split('_')[0]) || 60;
    lunchBreakHours = lunchMinutes / 60;
  }
  
  return Math.max(0, diffHours - lunchBreakHours);
}

/**
 * Legacy function for compatibility - use calculateMealBenefits instead
 */
export function calculateMealVoucherEarned(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): boolean {
  return calculateMealBenefits(timesheet, employeeSettings, companySettings).mealVoucher;
}

/**
 * Legacy function for compatibility - use calculateMealBenefits instead
 */
export function calculateDailyAllowanceEarned(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): boolean {
  return calculateMealBenefits(timesheet, employeeSettings, companySettings).dailyAllowance;
}