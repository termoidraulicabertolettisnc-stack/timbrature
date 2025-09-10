-- Update all existing timesheets to have consistent meal_voucher_earned values
-- This migration recalculates meal vouchers based on the simplified logic
UPDATE timesheets 
SET meal_voucher_earned = false
WHERE is_absence = true;

-- For non-absence timesheets, we'll set meal_voucher_earned to false for now
-- The frontend will calculate the correct values in real-time
UPDATE timesheets 
SET meal_voucher_earned = false
WHERE is_absence = false OR is_absence IS NULL;