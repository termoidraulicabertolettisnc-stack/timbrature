-- PULIZIA COMPLETA DEI DATI CORROTTI

-- 1. Elimino tutte le sessioni orfane o associate a timesheets corrotti
DELETE FROM timesheet_sessions 
WHERE timesheet_id IN (
  SELECT id FROM timesheets 
  WHERE start_time IS NULL OR end_time IS NULL
);

-- 2. Elimino tutti i timesheets corrotti (senza start_time o end_time)
DELETE FROM timesheets 
WHERE start_time IS NULL OR end_time IS NULL;

-- 3. Elimino anche le sessioni orfane (senza timesheet associato)
DELETE FROM timesheet_sessions 
WHERE timesheet_id NOT IN (SELECT id FROM timesheets);

-- 4. Reset delle sequenze per evitare conflitti
-- (Non applicabile per UUID, ma pulisco eventuali inconsistenze)