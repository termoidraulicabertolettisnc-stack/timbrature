-- Step 1: Add only the missing columns to company_settings table
-- Check if overtime_monthly_compensation exists, if not add it
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS overtime_monthly_compensation boolean DEFAULT false;

-- Create or replace function to synchronize employee settings when company settings change
CREATE OR REPLACE FUNCTION sync_employee_settings_structure()
RETURNS TRIGGER AS $$
BEGIN
  -- When company settings are updated, ensure all employees in this company 
  -- have the same structure available in their employee_settings
  -- This function will be enhanced in the application layer
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync structure when company settings are updated
DROP TRIGGER IF EXISTS sync_employee_settings_on_company_update ON company_settings;
CREATE TRIGGER sync_employee_settings_on_company_update
  AFTER UPDATE ON company_settings
  FOR EACH ROW
  EXECUTE FUNCTION sync_employee_settings_structure();