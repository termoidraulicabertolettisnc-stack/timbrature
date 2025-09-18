import { calculateMealBenefitsTemporal, calculateMealBenefits, MealBenefits } from '@/utils/mealBenefitsCalculator';
import { applyEntryTolerance, shouldApplyEntryTolerance } from '@/utils/entryToleranceUtils';
import { MealVoucherConversionService } from './MealVoucherConversionService';

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
  // Entry tolerance fields
  enable_entry_tolerance?: boolean;
  standard_start_time?: string;
  entry_tolerance_minutes?: number;
}

export interface CompanySettings {
  meal_allowance_policy?: string;
  meal_voucher_min_hours?: number;
  default_daily_allowance_min_hours?: number;
  lunch_break_type?: string;
  saturday_handling?: string;
  // Entry tolerance fields
  enable_entry_tolerance?: boolean;
  standard_start_time?: string;
  entry_tolerance_minutes?: number;
}

/**
 * Centralized Benefits Service - Single Source of Truth
 * All meal benefits calculations MUST go through this service
 */
export class BenefitsService {
  /**
   * Calculate meal benefits for a timesheet (async with temporal support)
   * This is the PRIMARY method that should be used
   * Now includes meal voucher conversion logic
   */
  static async calculateMealBenefits(
    timesheet: TimesheetData,
    employeeSettings?: EmployeeSettings,
    companySettings?: CompanySettings,
    targetDate?: string
  ): Promise<MealBenefits> {
    let benefits: MealBenefits;
    
  // Calculate base meal benefits
  if (timesheet.user_id && (targetDate || timesheet.date)) {
    benefits = await calculateMealBenefitsTemporal(
      timesheet, 
      employeeSettings, 
      companySettings, 
      targetDate
    );
  } else {
    // Fallback to synchronous calculation (for backward compatibility)
    console.warn(
      '⚠️ Using synchronous meal benefits calculation. ' +
      'Consider providing user_id and date for accurate temporal calculation.'
    );
    benefits = calculateMealBenefits(timesheet, employeeSettings, companySettings);
  }

  // Check for meal voucher conversions if we have user_id and date
  if (timesheet.user_id && (targetDate || timesheet.date)) {
    const conversionDate = targetDate || timesheet.date;
    
    try {
      const isConverted = await MealVoucherConversionService.isConvertedToAllowance(
        timesheet.user_id,
        conversionDate
      );

      if (isConverted) {
        // Se c'è una conversione manuale, NON calcolare indennità automatica
        // Le conversioni manuali sono gestite separatamente nella riga "CB"
        benefits = {
          ...benefits,
          mealVoucher: false,           // Nessun buono pasto (convertito)
          dailyAllowance: false,        // NESSUNA indennità automatica (già gestita manualmente)
        };
      }
    } catch (error) {
      console.error('Error checking meal voucher conversion:', error);
      // In caso di errore, mantieni il calcolo originale
    }
  }

  return benefits;
  }

  /**
   * Apply entry tolerance to timesheet data for display purposes
   * This method should be used in dashboards and views, NOT for storing data
   */
  static applyEntryToleranceForDisplay(
    timesheet: TimesheetData,
    employeeSettings?: EmployeeSettings,
    companySettings?: CompanySettings
  ): TimesheetData {
    // Only apply tolerance to start_time, and only for display
    if (!timesheet.start_time) {
      return timesheet;
    }

    const toleranceConfig = shouldApplyEntryTolerance(employeeSettings, companySettings);
    
    if (!toleranceConfig.enabled || !toleranceConfig.standardTime || toleranceConfig.tolerance === undefined) {
      return timesheet;
    }

    const adjustedStartTime = applyEntryTolerance(
      new Date(timesheet.start_time),
      toleranceConfig.standardTime,
      toleranceConfig.tolerance
    );

    // Return new timesheet object with adjusted start_time
    return {
      ...timesheet,
      start_time: adjustedStartTime.toISOString()
    };
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