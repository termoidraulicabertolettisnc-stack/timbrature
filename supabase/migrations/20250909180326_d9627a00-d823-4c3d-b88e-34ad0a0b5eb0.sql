-- Forza il ricalcolo dei timesheets per oggi aggiornando il trigger
UPDATE timesheets 
SET start_time = start_time 
WHERE date = '2025-09-09' 
  AND meal_voucher_earned = false 
  AND total_hours >= 6;