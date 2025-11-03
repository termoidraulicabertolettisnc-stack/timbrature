-- Fix process_import_batch to correctly convert time to timestamp
CREATE OR REPLACE FUNCTION public.process_import_batch(
    p_batch_id uuid,
    p_mode text DEFAULT 'all_or_nothing',
    p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
    success_count integer,
    error_count integer,
    warning_count integer,
    messages jsonb
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_row record;
    v_timesheet_id uuid;
    v_success_count integer := 0;
    v_error_count integer := 0;
    v_warning_count integer := 0;
    v_messages jsonb := '[]'::jsonb;
    v_has_errors boolean := false;
    v_start_timestamp timestamptz;
    v_end_timestamp timestamptz;
BEGIN
    -- Controlla errori per all_or_nothing
    IF p_mode = 'all_or_nothing' THEN
        SELECT COUNT(*) > 0 INTO v_has_errors
        FROM import_staging
        WHERE batch_id = p_batch_id
          AND validation_status = 'error';
        
        IF v_has_errors THEN
            SELECT 
                COUNT(*) FILTER (WHERE validation_status = 'error'),
                COUNT(*) FILTER (WHERE validation_status = 'warning')
            INTO v_error_count, v_warning_count
            FROM import_staging
            WHERE batch_id = p_batch_id;
            
            RETURN QUERY SELECT 0, v_error_count, v_warning_count, 
                               jsonb_build_object('error', 'Trovati errori di validazione');
            RETURN;
        END IF;
    END IF;
    
    -- Processa le righe valide
    FOR v_row IN 
        SELECT * FROM import_staging
        WHERE batch_id = p_batch_id
          AND processed = false
          AND (p_mode = 'partial' OR validation_status IN ('valid', 'warning'))
        ORDER BY date, start_time
    LOOP
        BEGIN
            -- Combina date + time in timestamp with time zone (Europe/Rome)
            v_start_timestamp := (v_row.date + v_row.start_time) AT TIME ZONE 'Europe/Rome';
            v_end_timestamp := (v_row.date + v_row.end_time) AT TIME ZONE 'Europe/Rome';
            
            -- Gestisci caso in cui end_time < start_time (attraversa la mezzanotte)
            IF v_row.end_time < v_row.start_time THEN
                v_end_timestamp := ((v_row.date + INTERVAL '1 day') + v_row.end_time) AT TIME ZONE 'Europe/Rome';
            END IF;
            
            -- Crea o aggiorna timesheet per il giorno
            INSERT INTO timesheets (user_id, date, created_by, notes)
            VALUES (
                v_row.user_id,
                v_row.date,
                COALESCE(p_user_id, v_row.imported_by),
                'Import Excel - ' || TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI')
            )
            ON CONFLICT (user_id, date) 
            DO UPDATE SET 
                updated_at = NOW(),
                notes = COALESCE(timesheets.notes, '') || ' | Import aggiuntivo'
            RETURNING id INTO v_timesheet_id;
            
            -- Crea la sessione con timestamp corretti
            INSERT INTO timesheet_sessions (
                timesheet_id,
                start_time,
                end_time,
                pause_minutes,
                notes,
                session_order
            ) VALUES (
                v_timesheet_id,
                v_start_timestamp,
                v_end_timestamp,
                v_row.pause_minutes,
                v_row.notes,
                COALESCE(
                    (SELECT MAX(session_order) + 1 FROM timesheet_sessions WHERE timesheet_id = v_timesheet_id),
                    0
                )
            );
            
            -- Marca come processato
            UPDATE import_staging
            SET processed = true
            WHERE id = v_row.id;
            
            v_success_count := v_success_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            RAISE NOTICE 'Errore riga %: %', v_row.row_number, SQLERRM;
            
            IF p_mode = 'all_or_nothing' THEN
                RAISE EXCEPTION 'Import fallito: %', SQLERRM;
            END IF;
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_success_count, v_error_count, v_warning_count, v_messages;
END;
$function$;