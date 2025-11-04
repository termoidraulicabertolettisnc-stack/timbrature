-- Change hour-based fields from INTEGER to NUMERIC to support decimal values

-- Update employee_settings table
ALTER TABLE employee_settings 
  ALTER COLUMN lunch_break_min_hours TYPE NUMERIC USING lunch_break_min_hours::NUMERIC,
  ALTER COLUMN meal_voucher_min_hours TYPE NUMERIC USING meal_voucher_min_hours::NUMERIC,
  ALTER COLUMN daily_allowance_min_hours TYPE NUMERIC USING daily_allowance_min_hours::NUMERIC,
  ALTER COLUMN overtime_after_hours TYPE NUMERIC USING overtime_after_hours::NUMERIC;

-- Update company_settings table  
ALTER TABLE company_settings
  ALTER COLUMN lunch_break_min_hours TYPE NUMERIC USING lunch_break_min_hours::NUMERIC,
  ALTER COLUMN meal_voucher_min_hours TYPE NUMERIC USING meal_voucher_min_hours::NUMERIC,
  ALTER COLUMN meal_voucher_min_hours_threshold TYPE NUMERIC USING meal_voucher_min_hours_threshold::NUMERIC,
  ALTER COLUMN default_daily_allowance_min_hours TYPE NUMERIC USING default_daily_allowance_min_hours::NUMERIC,
  ALTER COLUMN overtime_after_hours TYPE NUMERIC USING overtime_after_hours::NUMERIC;

-- Update global_defaults table
ALTER TABLE global_defaults
  ALTER COLUMN default_lunch_break_min_hours TYPE NUMERIC USING default_lunch_break_min_hours::NUMERIC,
  ALTER COLUMN default_meal_voucher_min_hours TYPE NUMERIC USING default_meal_voucher_min_hours::NUMERIC,
  ALTER COLUMN default_daily_allowance_min_hours TYPE NUMERIC USING default_daily_allowance_min_hours::NUMERIC;