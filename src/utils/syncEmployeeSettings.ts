import { supabase } from "@/integrations/supabase/client";

/**
 * Synchronizes employee settings structure when company settings change
 * This ensures all employees have access to the same configuration options
 */
export const syncEmployeeSettingsStructure = async (companyId: string) => {
  try {
    console.log('Synchronizing employee settings structure for company:', companyId);
    
    // Get all employee settings for this company
    const { data: employeeSettings, error: fetchError } = await supabase
      .from('employee_settings')
      .select('*')
      .eq('company_id', companyId);

    if (fetchError) {
      console.error('Error fetching employee settings:', fetchError);
      return { success: false, error: fetchError };
    }

    // Get the company settings to use as template
    const { data: companySettings, error: companyError } = await supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (companyError) {
      console.error('Error fetching company settings:', companyError);
      return { success: false, error: companyError };
    }

    if (!companySettings || !employeeSettings) {
      return { success: true, message: 'No settings to sync' };
    }

    // For each employee, ensure they have access to all company setting fields
    // Only update if the employee setting is NULL (inheriting from company)
    // Never overwrite personalized employee settings
    const updates = employeeSettings.map(async (empSetting) => {
      const updatedSetting = {
        ...empSetting,
        // Only set fields to NULL if they don't exist (for inheritance)
        // This ensures new fields added to company settings are available to employees
        standard_weekly_hours: empSetting.standard_weekly_hours !== undefined ? empSetting.standard_weekly_hours : null,
        lunch_break_type: empSetting.lunch_break_type !== undefined ? empSetting.lunch_break_type : null,
        saturday_handling: empSetting.saturday_handling !== undefined ? empSetting.saturday_handling : null,
        meal_voucher_policy: empSetting.meal_voucher_policy !== undefined ? empSetting.meal_voucher_policy : null,
        night_shift_start: empSetting.night_shift_start !== undefined ? empSetting.night_shift_start : null,
        night_shift_end: empSetting.night_shift_end !== undefined ? empSetting.night_shift_end : null,
        overtime_monthly_compensation: empSetting.overtime_monthly_compensation !== undefined ? empSetting.overtime_monthly_compensation : null,
        business_trip_rate_with_meal: empSetting.business_trip_rate_with_meal !== undefined ? empSetting.business_trip_rate_with_meal : null,
        business_trip_rate_without_meal: empSetting.business_trip_rate_without_meal !== undefined ? empSetting.business_trip_rate_without_meal : null,
        saturday_hourly_rate: empSetting.saturday_hourly_rate !== undefined ? empSetting.saturday_hourly_rate : null,
        meal_voucher_amount: empSetting.meal_voucher_amount !== undefined ? empSetting.meal_voucher_amount : null,
        daily_allowance_amount: empSetting.daily_allowance_amount !== undefined ? empSetting.daily_allowance_amount : null,
        meal_allowance_policy: empSetting.meal_allowance_policy !== undefined ? empSetting.meal_allowance_policy : null,
        daily_allowance_min_hours: empSetting.daily_allowance_min_hours !== undefined ? empSetting.daily_allowance_min_hours : null,
        meal_voucher_min_hours: empSetting.meal_voucher_min_hours !== undefined ? empSetting.meal_voucher_min_hours : null,
        updated_at: new Date().toISOString()
      };

      return supabase
        .from('employee_settings')
        .update(updatedSetting)
        .eq('id', empSetting.id);
    });

    await Promise.all(updates);
    
    console.log('Employee settings structure synchronized successfully');
    return { success: true, message: 'Employee settings synchronized' };

  } catch (error) {
    console.error('Error synchronizing employee settings:', error);
    return { success: false, error };
  }
};

/**
 * Gets the effective setting value for an employee
 * Returns the employee's personal setting if set, otherwise falls back to company setting
 */
export const getEffectiveSetting = (
  employeeSetting: any,
  companySetting: any,
  fieldName: string
): any => {
  // If employee has a personal setting, use it
  if (employeeSetting && employeeSetting[fieldName] !== null && employeeSetting[fieldName] !== undefined) {
    return employeeSetting[fieldName];
  }
  
  // Otherwise fall back to company setting
  if (companySetting && companySetting[fieldName] !== null && companySetting[fieldName] !== undefined) {
    return companySetting[fieldName];
  }
  
  // Return null if neither is set
  return null;
};

/**
 * Creates default employee settings for a new employee
 * All fields are set to NULL so they inherit from company settings
 */
export const createDefaultEmployeeSettings = async (
  userId: string, 
  companyId: string, 
  createdBy: string
) => {
  try {
    const defaultEmployeeSettings = {
      user_id: userId,
      company_id: companyId,
      created_by: createdBy,
      valid_from: new Date().toISOString().split('T')[0], // Today's date
      // All fields set to NULL to inherit from company settings
      standard_weekly_hours: null,
      lunch_break_type: null,
      saturday_handling: null,
      meal_voucher_policy: null,
      night_shift_start: null,
      night_shift_end: null,
      overtime_monthly_compensation: null,
      business_trip_rate_with_meal: null,
      business_trip_rate_without_meal: null,
      saturday_hourly_rate: null,
      meal_voucher_amount: null,
      daily_allowance_amount: null,
      meal_allowance_policy: null,
      daily_allowance_min_hours: null,
      meal_voucher_min_hours: null,
    };

    const { data, error } = await supabase
      .from('employee_settings')
      .insert(defaultEmployeeSettings)
      .select()
      .single();

    if (error) {
      console.error('Error creating default employee settings:', error);
      return { success: false, error };
    }

    console.log('Default employee settings created successfully');
    return { success: true, data };

  } catch (error) {
    console.error('Error creating default employee settings:', error);
    return { success: false, error };
  }
};
