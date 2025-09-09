-- Clean up Thomas's duplicate employee_settings records
-- Delete the record with meal_vouchers_only policy (the more recent one causing the issue)
DELETE FROM employee_settings 
WHERE id = 'b0c86acd-509e-4527-a097-d9013197325a';

-- Update Thomas's remaining record to have proper daily allowance values
UPDATE employee_settings 
SET 
  daily_allowance_amount = 10.00,
  daily_allowance_min_hours = 6,
  updated_at = now()
WHERE id = 'e60e7d91-6cfc-4cea-9cb8-d9e00da8c98a';

-- Add meal_voucher_min_hours column to both company_settings and employee_settings for flexibility
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS meal_voucher_min_hours integer DEFAULT 6;

ALTER TABLE employee_settings 
ADD COLUMN IF NOT EXISTS meal_voucher_min_hours integer DEFAULT NULL;