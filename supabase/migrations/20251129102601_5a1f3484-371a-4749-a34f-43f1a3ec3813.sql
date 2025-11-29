
-- 1. ELIMINA SESSIONI DUPLICATE (mantiene quella con ID più vecchio)
DELETE FROM timesheet_sessions
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY timesheet_id, start_time, end_time 
        ORDER BY created_at ASC, id ASC
      ) as rn
    FROM timesheet_sessions
  ) sub
  WHERE rn > 1
);

-- 2. AGGIUNGI VINCOLO UNIQUE PER PREVENIRE DUPLICATI FUTURI
-- Prima verifica che non ci siano più duplicati
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'timesheet_sessions_unique_entry'
  ) THEN
    ALTER TABLE timesheet_sessions
    ADD CONSTRAINT timesheet_sessions_unique_entry 
    UNIQUE (timesheet_id, start_time, end_time);
  END IF;
END $$;

-- 3. CREA INDICE PER MIGLIORARE PERFORMANCE DI RICERCA DUPLICATI
CREATE INDEX IF NOT EXISTS idx_timesheet_sessions_lookup 
ON timesheet_sessions (timesheet_id, start_time, end_time);
