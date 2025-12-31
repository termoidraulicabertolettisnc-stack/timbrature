-- Fix existing employee settings where meal_allowance_policy = 'disabled' but meal_voucher_enabled = true
-- This syncs the meal_voucher_enabled field with the policy setting

UPDATE employee_settings 
SET meal_voucher_enabled = false,
    updated_at = now()
WHERE meal_allowance_policy = 'disabled' 
AND (meal_voucher_enabled = true OR meal_voucher_enabled IS NULL);

-- Also fix cases where policy is 'daily_allowance' (no meal vouchers)
UPDATE employee_settings 
SET meal_voucher_enabled = false,
    updated_at = now()
WHERE meal_allowance_policy = 'daily_allowance' 
AND (meal_voucher_enabled = true OR meal_voucher_enabled IS NULL);