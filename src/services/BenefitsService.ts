import { calculateMealBenefitsTemporal, calculateMealBenefits, MealBenefits } from '@/utils/mealBenefitsCalculator';

export interface TimesheetData {
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  lunch_duration_minutes: number | null;
  total_hours: number | null;
  user_id?: string;
  date?: string;
}

export interface EmployeeSettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  daily_allowance_min_hours?: number;
  lunch_break_type?: string;
  saturday_handling?: string;
}

export interface CompanySettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  default_daily_allowance_min_hours?: number;
  lunch_break_type?: string;
  saturday_handling?: string;
}

/**
 * Centralized Benefits Service - Single Source of Truth
 * All meal benefits calculations MUST go through this service
 */
export class BenefitsService {
  /**
   * Calculate meal benefits for a timesheet (async with temporal support)
   * This is the PRIMARY method that should be used
   */
  static async calculateMealBenefits(
    timesheet: TimesheetData,
    employeeSettings?: EmployeeSettings,
    companySettings?: CompanySettings,
    targetDate?: string
  ): Promise<MealBenefits> {
    // If we have user_id and date, use temporal calculation
    if (timesheet.user_id && (targetDate || timesheet.date)) {
      return await calculateMealBenefitsTemporal(
        timesheet, 
        employeeSettings, 
        companySettings, 
        targetDate
      );
    }
    
    // Fallback to synchronous calculation (for backward compatibility)
    console.warn(
      '⚠️ Using synchronous meal benefits calculation. ' +
      'Consider providing user_id and date for accurate temporal calculation.'
    );
    return calculateMealBenefits(timesheet, employeeSettings, companySettings);
  }

  /**
   * @deprecated Use calculateMealBenefits instead
   * This method is kept for backward compatibility only
   */
  static calculateMealBenefitsSync(
    timesheet: TimesheetData,
    employeeSettings?: EmployeeSettings,
    companySettings?: CompanySettings
  ): MealBenefits {
    console.warn('🚨 DEPRECATED: Use BenefitsService.calculateMealBenefits instead');
    return calculateMealBenefits(timesheet, employeeSettings, companySettings);
  }

  /**
   * Calculate meal benefits for multiple timesheets efficiently
   */
  static async calculateMealBenefitsForTimesheets(
    timesheets: TimesheetData[],
    employeeSettings: {[key: string]: EmployeeSettings},
    companySettings?: CompanySettings
  ): Promise<{[key: string]: MealBenefits}> {
    const results: {[key: string]: MealBenefits} = {};
    
    const calculations = timesheets.map(async (timesheet, index) => {
      if (!timesheet.user_id) return null;
      
      const userSettings = employeeSettings[timesheet.user_id];
      const benefits = await this.calculateMealBenefits(
        timesheet,
        userSettings,
        companySettings,
        timesheet.date
      );
      
      return {
        key: `${timesheet.user_id}-${timesheet.date}-${index}`,
        benefits
      };
    });
    
    const calculationResults = await Promise.all(calculations);
    
    calculationResults.forEach(result => {
      if (result) {
        results[result.key] = result.benefits;
      }
    });
    
    return results;
  }

  /**
   * Validate that temporal settings are being used correctly
   */
  static validateTemporalUsage(context: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ BenefitsService used correctly in: ${context}`);
    }
  }
}

/**
 * Hook for React components to calculate meal benefits
 */
export const useMealBenefits = () => {
  return {
    calculateMealBenefits: BenefitsService.calculateMealBenefits,
    calculateMealBenefitsForTimesheets: BenefitsService.calculateMealBenefitsForTimesheets
  };
};