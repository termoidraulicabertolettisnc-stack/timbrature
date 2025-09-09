-- Create enum for unified meal allowance policy
CREATE TYPE meal_allowance_policy AS ENUM (
  'disabled',
  'meal_vouchers_only', 
  'meal_vouchers_always',
  'daily_allowance'
);

-- Add meal_allowance_policy column to company_settings
ALTER TABLE public.company_settings 
ADD COLUMN meal_allowance_policy meal_allowance_policy DEFAULT 'disabled',
ADD COLUMN default_daily_allowance_amount numeric DEFAULT 10.00,
ADD COLUMN default_daily_allowance_min_hours integer DEFAULT 6;

-- Add meal_allowance_policy column to employee_settings
ALTER TABLE public.employee_settings 
ADD COLUMN meal_allowance_policy meal_allowance_policy DEFAULT NULL;

-- Update existing company_settings to set default values
UPDATE public.company_settings 
SET 
  default_daily_allowance_amount = 10.00,
  default_daily_allowance_min_hours = 6
WHERE default_daily_allowance_amount IS NULL OR default_daily_allowance_min_hours IS NULL;

-- Migrate existing employee_settings data to new unified policy
-- Priority: daily_allowance > meal_vouchers_always > meal_vouchers_only > disabled
UPDATE public.employee_settings 
SET meal_allowance_policy = CASE
  WHEN daily_allowance_policy = 'alternative_to_voucher' THEN 'daily_allowance'::meal_allowance_policy
  WHEN meal_voucher_policy = 'sempre_parttime' THEN 'meal_vouchers_always'::meal_allowance_policy  
  WHEN meal_voucher_policy = 'oltre_6_ore' THEN 'meal_vouchers_only'::meal_allowance_policy
  WHEN meal_voucher_policy = 'disabilitato' THEN 'disabled'::meal_allowance_policy
  ELSE 'disabled'::meal_allowance_policy
END;

-- Clean up Thomas Bertoletti's duplicate records - keep the most recent one
DELETE FROM public.employee_settings 
WHERE user_id = (SELECT user_id FROM profiles WHERE email = 'thomas.bertoletti@gmail.com' LIMIT 1)
AND id NOT IN (
  SELECT id FROM public.employee_settings 
  WHERE user_id = (SELECT user_id FROM profiles WHERE email = 'thomas.bertoletti@gmail.com' LIMIT 1)
  ORDER BY updated_at DESC 
  LIMIT 1
);

-- Update Thomas's record to use daily_allowance policy with proper values
UPDATE public.employee_settings 
SET 
  meal_allowance_policy = 'daily_allowance'::meal_allowance_policy,
  daily_allowance_amount = 10.00,
  daily_allowance_min_hours = 6,
  meal_voucher_policy = 'disabilitato'::meal_voucher_type
WHERE user_id = (SELECT user_id FROM profiles WHERE email = 'thomas.bertoletti@gmail.com' LIMIT 1);