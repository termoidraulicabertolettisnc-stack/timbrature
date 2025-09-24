-- Forza il ricalcolo del timesheet specifico dopo il fix
UPDATE timesheets 
SET updated_at = NOW()
WHERE id = '4edb7890-0155-41f8-8e85-3c67576d0fff';