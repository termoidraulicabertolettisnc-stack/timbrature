-- Trigger recalculation for Mihai's August timesheets
UPDATE timesheets 
SET updated_at = now() 
WHERE user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Mihai') 
  AND date >= '2025-08-01' 
  AND date < '2025-09-01';