import { getEmployeeSettingsForDate, TemporalEmployeeSettings } from './temporalEmployeeSettings';

interface TimesheetData {
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  lunch_duration_minutes: number | null;
  total_hours: number | null;
  user_id?: string;
  date?: string;
}

interface EmployeeSettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  daily_allowance_min_hours?: number;
  lunch_break_type?: string;
  saturday_handling?: string;
  meal_voucher_enabled?: boolean;
}

interface CompanySettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  default_daily_allowance_min_hours?: number;
  lunch_break_type?: string;
  saturday_handling?: string;
  meal_voucher_enabled?: boolean;
}

export interface MealBenefits {
  mealVoucher: boolean;
  dailyAllowance: boolean;
  workedHours: number;
  // Importi monetari specifici
  mealVoucherAmount?: number;
  dailyAllowanceAmount?: number;
}

/**
 * Centralized calculation for meal benefits (vouchers and daily allowances)  
 * This is the single source of truth for meal benefit calculations
 * This is the synchronous version for backward compatibility
 */
export function calculateMealBenefits(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): MealBenefits {
  // Calculate worked hours
  const workedHours = calculateWorkedHours(timesheet, employeeSettings, companySettings);
  
  // DEBUG: Log meal voucher calculation
  console.log('🍽️ [MealBenefits] Calcolo buoni pasto:', {
    date: timesheet.date,
    start_time: timesheet.start_time,
    end_time: timesheet.end_time,
    workedHours,
    employeePolicy: employeeSettings?.meal_allowance_policy,
    employeeMealVoucherEnabled: employeeSettings?.meal_voucher_enabled,
    companyPolicy: companySettings?.meal_allowance_policy,
    companyMealVoucherEnabled: companySettings?.meal_voucher_enabled,
  });
  
  if (workedHours === 0) {
    console.log('🍽️ [MealBenefits] ❌ workedHours = 0, nessun buono pasto');
    return { 
      mealVoucher: false, 
      dailyAllowance: false, 
      workedHours: 0,
      mealVoucherAmount: 0,
      dailyAllowanceAmount: 0 
    };
  }

  // Check if it's Saturday and configured as "trasferta"
  if (timesheet.date) {
    const workDate = new Date(timesheet.date);
    const isSaturday = workDate.getDay() === 6;
    
    if (isSaturday) {
      const saturdayHandling = employeeSettings?.saturday_handling || 
                              companySettings?.saturday_handling || 
                              'straordinario';
      
      // If Saturday is configured as "trasferta", no meal benefits
      if (saturdayHandling === 'trasferta') {
        return { 
          mealVoucher: false, 
          dailyAllowance: false, 
          workedHours,
          mealVoucherAmount: 0,
          dailyAllowanceAmount: 0 
        };
      }
    }
  }

  // Determine effective policy - consider both meal_allowance_policy AND meal_voucher_enabled
  let policy = employeeSettings?.meal_allowance_policy || 
               companySettings?.meal_allowance_policy || 
               'disabled';

  // CRITICAL FIX: Check meal_voucher_enabled - if explicitly false, disable meal vouchers
  // Priority: employee setting > company setting > default (false)
  const employeeMealVoucherEnabled = employeeSettings?.meal_voucher_enabled;
  const companyMealVoucherEnabled = companySettings?.meal_voucher_enabled;
  
  // If employee explicitly set meal_voucher_enabled to false, disable it
  // Otherwise fall back to company setting, then default to false
  const mealVoucherEnabled = employeeMealVoucherEnabled !== undefined 
    ? employeeMealVoucherEnabled 
    : (companyMealVoucherEnabled ?? false);
  
  console.log('🍽️ [MealBenefits] Policy check:', {
    initialPolicy: policy,
    employeeMealVoucherEnabled,
    companyMealVoucherEnabled,
    effectiveMealVoucherEnabled: mealVoucherEnabled,
  });
  
  // If meal_voucher_enabled is explicitly false, disable meal vouchers regardless of policy
  if (mealVoucherEnabled === false) {
    console.log('🍽️ [MealBenefits] ❌ meal_voucher_enabled = false, nessun buono pasto');
    return { 
      mealVoucher: false, 
      dailyAllowance: policy === 'daily_allowance' || policy === 'both' ? workedHours >= (employeeSettings?.daily_allowance_min_hours || companySettings?.default_daily_allowance_min_hours || 6) : false, 
      workedHours,
      mealVoucherAmount: 0,
      dailyAllowanceAmount: 0 
    };
  }
  
  // If meal_voucher_enabled is true but policy is 'disabled', 
  // treat it as 'meal_vouchers_only' for backward compatibility
  if (policy === 'disabled' && mealVoucherEnabled) {
    policy = 'meal_vouchers_only';
    console.log('🍽️ [MealBenefits] ✅ Policy overridden to meal_vouchers_only');
  }

  if (policy === 'disabled') {
    console.log('🍽️ [MealBenefits] ❌ Policy disabled, nessun buono pasto');
    return { 
      mealVoucher: false, 
      dailyAllowance: false, 
      workedHours,
      mealVoucherAmount: 0,
      dailyAllowanceAmount: 0 
    };
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

  console.log('🍽️ [MealBenefits] Risultato finale:', {
    policy,
    mealVoucherMinHours,
    workedHours,
    meetsMealVoucherMinimum,
    mealVoucher,
    dailyAllowance,
  });

  return { 
    mealVoucher, 
    dailyAllowance, 
    workedHours,
    mealVoucherAmount: mealVoucher ? 8.00 : 0,  // Default amounts
    dailyAllowanceAmount: dailyAllowance ? 10.00 : 0
  };
}

/**
 * Temporal version of meal benefits calculation
 * This version fetches employee settings for a specific date
 */
export async function calculateMealBenefitsTemporal(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings,
  targetDate?: string
): Promise<MealBenefits> {
  // If we have user_id and date, fetch temporal settings
  let effectiveEmployeeSettings = employeeSettings;
  
  if (timesheet.user_id && (targetDate || timesheet.date)) {
    const date = targetDate || timesheet.date!;
    const temporalSettings = await getEmployeeSettingsForDate(timesheet.user_id, date);
    
    if (temporalSettings) {
      effectiveEmployeeSettings = mapTemporalToEmployeeSettings(temporalSettings);
    }
  }

  // Use the synchronous calculation with temporal settings
  return calculateMealBenefits(timesheet, effectiveEmployeeSettings, companySettings);
}

/**
 * Helper function to convert temporal settings to employee settings format
 */
function mapTemporalToEmployeeSettings(temporal: TemporalEmployeeSettings): EmployeeSettings {
  return {
    meal_allowance_policy: temporal.meal_allowance_policy,
    meal_voucher_min_hours: temporal.meal_voucher_min_hours,
    daily_allowance_min_hours: temporal.daily_allowance_min_hours,
    lunch_break_type: temporal.lunch_break_type,
    saturday_handling: temporal.saturday_handling,
    meal_voucher_enabled: temporal.meal_voucher_enabled
  };
}

/**
 * Calculate worked hours for a timesheet
 * Uses total_hours if available (already calculated), otherwise calculates from times
 */
function calculateWorkedHours(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings
): number {
  // CRITICAL FIX: Use total_hours if available (for session-based timesheets)
  if (timesheet.total_hours && timesheet.total_hours > 0) {
    console.log('🕐 [WorkedHours] Using total_hours:', timesheet.total_hours);
    return timesheet.total_hours;
  }
  
  if (!timesheet.start_time || !timesheet.end_time) {
    console.log('🕐 [WorkedHours] ❌ No start_time/end_time and no total_hours');
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

/**
 * Temporal versions of legacy functions
 */
export async function calculateMealVoucherEarnedTemporal(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings,
  targetDate?: string
): Promise<boolean> {
  const result = await calculateMealBenefitsTemporal(timesheet, employeeSettings, companySettings, targetDate);
  return result.mealVoucher;
}

export async function calculateDailyAllowanceEarnedTemporal(
  timesheet: TimesheetData,
  employeeSettings?: EmployeeSettings,
  companySettings?: CompanySettings,
  targetDate?: string
): Promise<boolean> {
  const result = await calculateMealBenefitsTemporal(timesheet, employeeSettings, companySettings, targetDate);
  return result.dailyAllowance;
}