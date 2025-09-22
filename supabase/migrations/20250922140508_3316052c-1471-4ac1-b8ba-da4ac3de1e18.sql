-- Forza il ricalcolo del timesheet aggiornando il campo updated_at
UPDATE timesheets 
SET updated_at = NOW(),
    notes = COALESCE(notes, '') || ' - Forzato ricalcolo per debug - ' || NOW()::text
WHERE id = '4edb7890-0155-41f8-8e85-3c67576d0fff';