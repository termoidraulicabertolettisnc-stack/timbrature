-- Correct business trip rate defaults and add missing fields for meal vouchers and daily allowances
ALTER TABLE public.company_settings 
  ALTER COLUMN business_trip_rate_with_meal SET DEFAULT 30.98,
  ALTER COLUMN business_trip_rate_without_meal SET DEFAULT 46.48,
  ADD COLUMN IF NOT EXISTS meal_voucher_amount numeric DEFAULT 8.00,
  ADD COLUMN IF NOT EXISTS daily_allowance_amount numeric DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS daily_allowance_policy text DEFAULT 'disabled' CHECK (daily_allowance_policy IN ('disabled', 'alternative_to_voucher')),
  ADD COLUMN IF NOT EXISTS daily_allowance_min_hours integer DEFAULT 6;

ALTER TABLE public.employee_settings 
  ADD COLUMN IF NOT EXISTS meal_voucher_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_allowance_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS daily_allowance_policy text DEFAULT NULL CHECK (daily_allowance_policy IS NULL OR daily_allowance_policy IN ('disabled', 'alternative_to_voucher')),
  ADD COLUMN IF NOT EXISTS daily_allowance_min_hours integer DEFAULT NULL;

-- Update existing records to use correct defaults
UPDATE public.company_settings 
SET business_trip_rate_with_meal = 30.98, 
    business_trip_rate_without_meal = 46.48,
    meal_voucher_amount = 8.00,
    daily_allowance_amount = 10.00
WHERE business_trip_rate_with_meal = 46.48 OR meal_voucher_amount IS NULL;