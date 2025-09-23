-- Fix Lorenzo's empty timesheets to be marked as absences
UPDATE timesheets 
SET is_absence = true, 
    absence_type = 'F', 
    total_hours = 0,
    notes = 'Assenza importata da Excel (corretto automaticamente)',
    updated_at = now()
WHERE user_id IN (
  SELECT user_id FROM profiles WHERE first_name ILIKE 'Lorenzo%'
) 
AND date >= '2025-08-01' 
AND date <= '2025-08-31'
AND total_hours IS NULL 
AND is_absence = false;