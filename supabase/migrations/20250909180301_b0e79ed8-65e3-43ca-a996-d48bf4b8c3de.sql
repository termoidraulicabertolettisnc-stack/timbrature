-- Aggiorna gli employee_settings con meal_allowance_policy 'both' per impostare meal_voucher_min_hours se è NULL
UPDATE employee_settings 
SET meal_voucher_min_hours = 6 
WHERE meal_allowance_policy = 'both' AND meal_voucher_min_hours IS NULL;

-- Ricalcola i meal_voucher per i timesheets esistenti con il trigger
UPDATE timesheets 
SET updated_at = now() 
WHERE date >= CURRENT_DATE - INTERVAL '7 days' 
  AND meal_voucher_earned = false 
  AND total_hours >= 6;