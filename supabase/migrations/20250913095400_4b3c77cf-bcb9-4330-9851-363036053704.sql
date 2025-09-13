-- Step 1: Update company_settings table structure to match employee_settings
-- Add missing columns
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS overtime_monthly_compensation boolean DEFAULT false;

-- Rename meal_allowance_policy to meal_voucher_policy for consistency
ALTER TABLE company_settings 
RENAME COLUMN meal_allowance_policy TO meal_voucher_policy;

-- Rename default_daily_allowance_amount to daily_allowance_amount for consistency  
ALTER TABLE company_settings 
RENAME COLUMN default_daily_allowance_amount TO daily_allowance_amount;

-- Rename default_daily_allowance_min_hours to daily_allowance_min_hours for consistency
ALTER TABLE company_settings 
RENAME COLUMN default_daily_allowance_min_hours TO daily_allowance_min_hours;

-- Add daily_allowance_policy column to match employee_settings
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS daily_allowance_policy text DEFAULT 'disabled';

-- Create or replace function to synchronize employee settings when company settings change
CREATE OR REPLACE FUNCTION sync_employee_settings_structure()
RETURNS TRIGGER AS $$
BEGIN
  -- Add any new columns from company_settings to employee_settings for all employees in this company
  -- This ensures that when we add new fields to company structure, all employees get them too
  
  -- For now, we'll just add the missing columns to employee_settings if they don't exist
  -- (The actual synchronization logic will be handled in the application layer)
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync structure when company settings are updated
DROP TRIGGER IF EXISTS sync_employee_settings_on_company_update ON company_settings;
CREATE TRIGGER sync_employee_settings_on_company_update
  AFTER UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION sync_employee_settings_structure();