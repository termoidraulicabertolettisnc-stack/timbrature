-- Migration to fix existing timesheets with lunch breaks by creating proper sessions
-- This will convert timesheets with lunch breaks into multiple work sessions

DO $$ 
DECLARE
    timesheet_record RECORD;
    processed_count INTEGER := 0;
BEGIN
    -- Process all timesheets that have lunch breaks but only one session
    FOR timesheet_record IN 
        SELECT t.id, t.start_time, t.end_time, t.lunch_start_time, t.lunch_end_time, t.user_id
        FROM timesheets t
        WHERE t.lunch_start_time IS NOT NULL 
        AND t.lunch_end_time IS NOT NULL
        AND t.start_time IS NOT NULL
        AND t.end_time IS NOT NULL
        AND t.is_absence = false
        AND (SELECT COUNT(*) FROM timesheet_sessions WHERE timesheet_id = t.id AND session_type = 'work') = 1
    LOOP
        -- Delete the existing single session that spans the entire work period
        DELETE FROM timesheet_sessions 
        WHERE timesheet_id = timesheet_record.id 
        AND session_type = 'work';
        
        -- Create first work session (start_time to lunch_start_time)
        INSERT INTO timesheet_sessions (
            timesheet_id, session_order, session_type, 
            start_time, end_time, notes
        ) VALUES (
            timesheet_record.id, 1, 'work',
            timesheet_record.start_time, timesheet_record.lunch_start_time,
            'Sessione mattino'
        );
        
        -- Create lunch break session
        INSERT INTO timesheet_sessions (
            timesheet_id, session_order, session_type,
            start_time, end_time, notes
        ) VALUES (
            timesheet_record.id, 2, 'lunch_break',
            timesheet_record.lunch_start_time, timesheet_record.lunch_end_time,
            'Pausa pranzo'
        );
        
        -- Create second work session (lunch_end_time to end_time)
        INSERT INTO timesheet_sessions (
            timesheet_id, session_order, session_type,
            start_time, end_time, notes
        ) VALUES (
            timesheet_record.id, 3, 'work',
            timesheet_record.lunch_end_time, timesheet_record.end_time,
            'Sessione pomeriggio'
        );
        
        processed_count := processed_count + 1;
        RAISE NOTICE 'Fixed timesheet % for user %', timesheet_record.id, timesheet_record.user_id;
    END LOOP;
    
    RAISE NOTICE 'Migration completed. Fixed % timesheets with lunch breaks.', processed_count;
END $$;