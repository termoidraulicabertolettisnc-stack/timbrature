-- Forza il ricalcolo attraverso le sessioni invece che direttamente sul timesheet
-- Questo attiverà il trigger corretto per le sessioni
UPDATE timesheet_sessions 
SET updated_at = NOW()
WHERE timesheet_id = (
    SELECT t.id 
    FROM timesheets t
    JOIN profiles p ON t.user_id = p.user_id
    WHERE p.email = 'thomas.bertoletti@bertolettigroup.com'
      AND t.date = '2025-09-02'
);