-- Forza il ricalcolo del timesheet problematico specifico
UPDATE timesheets 
SET updated_at = NOW()
WHERE date = '2025-09-22' 
  AND user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Thomas');