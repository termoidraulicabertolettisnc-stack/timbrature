-- Fix import time columns type mismatch
-- Step 1: Drop views that depend on import_staging
DROP VIEW IF EXISTS import_preview CASCADE;

-- Step 2: Alter table columns to time WITHOUT TIME ZONE
ALTER TABLE import_staging 
  ALTER COLUMN start_time TYPE time WITHOUT TIME ZONE,
  ALTER COLUMN end_time TYPE time WITHOUT TIME ZONE;

-- Step 3: Recreate import_preview view
CREATE VIEW import_preview AS
SELECT 
    s.*,
    p.first_name || ' ' || p.last_name as employee_name,
    CASE 
        WHEN s.validation_status = 'error' THEN 'red'
        WHEN s.validation_status = 'warning' THEN 'yellow'
        ELSE 'green'
    END as row_color,
    EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0 as calculated_hours
FROM import_staging s
LEFT JOIN profiles p ON p.user_id = s.user_id;