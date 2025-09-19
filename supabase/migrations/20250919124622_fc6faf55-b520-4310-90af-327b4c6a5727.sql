-- Ricalcola le ore notturne per tutti i timesheet di Mihai di agosto 2025
UPDATE timesheets 
SET updated_at = now()
WHERE user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Mihai') 
AND date >= '2025-08-01' 
AND date <= '2025-08-31';