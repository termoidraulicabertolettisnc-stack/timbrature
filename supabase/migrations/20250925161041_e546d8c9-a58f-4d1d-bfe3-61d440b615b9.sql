-- Correggi il trigger per gestire la pausa pranzo anche con le sessioni multiple
CREATE OR REPLACE FUNCTION public.calculate_hours_on_session_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    timesheet_record record;
    total_work_minutes numeric := 0;
    session_rec record;
    work_duration interval;
    calculated_overtime_hours numeric := 0;
    calculated_night_hours numeric := 0;
    standard_daily_hours_for_day integer := 8;
    weekly_hours_config jsonb;
    day_name text;
    is_saturday_calc boolean;
    employee_settings_rec record := NULL;
    company_settings_rec record := NULL;
    saturday_handling_type text;
    local_start_time timestamp without time zone;
    local_end_time timestamp without time zone;
    night_start_time time := '22:00:00'::time;
    night_end_time time := '05:00:00'::time;
    night_overlap_minutes numeric := 0;
    night_start_today timestamp without time zone;
    night_end_today timestamp without time zone;
    temp_start timestamp without time zone;
    temp_end timestamp without time zone;
    
    -- NUOVE VARIABILI PER PAUSA PRANZO
    lunch_break_minutes integer := 60;
    lunch_break_min_hours numeric := 6;
    total_raw_hours numeric := 0;
BEGIN
    -- Get the timesheet ID to work with
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO timesheet_record FROM public.timesheets WHERE id = OLD.timesheet_id;
    ELSE
        SELECT * INTO timesheet_record FROM public.timesheets WHERE id = NEW.timesheet_id;
    END IF;
    
    -- Exit early if no timesheet found
    IF timesheet_record IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Skip calculation for absences
    IF timesheet_record.is_absence = true THEN
        UPDATE public.timesheets 
        SET total_hours = 0, overtime_hours = 0, night_hours = 0, updated_at = now()
        WHERE id = timesheet_record.id;
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Get employee settings
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = timesheet_record.user_id
      AND (es.valid_from IS NULL OR es.valid_from <= timesheet_record.date)
      AND (es.valid_to IS NULL OR es.valid_to >= timesheet_record.date)
    ORDER BY es.valid_from DESC NULLS LAST, es.created_at DESC
    LIMIT 1;

    -- Get company settings
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = timesheet_record.user_id
    LIMIT 1;

    -- NUOVO: Determina impostazioni pausa pranzo
    IF employee_settings_rec.user_id IS NOT NULL THEN
        CASE COALESCE(employee_settings_rec.lunch_break_type, company_settings_rec.lunch_break_type, '60_minuti')
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        lunch_break_min_hours := COALESCE(employee_settings_rec.lunch_break_min_hours,
                                         company_settings_rec.lunch_break_min_hours,
                                         6.0);
    ELSIF company_settings_rec.company_id IS NOT NULL THEN
        CASE COALESCE(company_settings_rec.lunch_break_type, '60_minuti')
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        lunch_break_min_hours := COALESCE(company_settings_rec.lunch_break_min_hours, 6.0);
    END IF;

    -- Calculate total work hours from all work sessions
    FOR session_rec IN 
        SELECT * FROM public.timesheet_sessions 
        WHERE timesheet_id = timesheet_record.id 
        AND session_type = 'work' 
        AND end_time IS NOT NULL
        ORDER BY session_order
    LOOP
        work_duration := session_rec.end_time - session_rec.start_time;
        total_work_minutes := total_work_minutes + (EXTRACT(EPOCH FROM work_duration) / 60);
        
        -- Calculate night hours for this session
        local_start_time := session_rec.start_time AT TIME ZONE 'Europe/Rome';
        local_end_time := session_rec.end_time AT TIME ZONE 'Europe/Rome';

        -- Determine night shift times
        IF employee_settings_rec.user_id IS NOT NULL THEN
            night_start_time := COALESCE(employee_settings_rec.night_shift_start, '22:00:00'::time);
            night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
        ELSIF company_settings_rec.company_id IS NOT NULL THEN
            night_start_time := company_settings_rec.night_shift_start;
            night_end_time := company_settings_rec.night_shift_end;
        END IF;

        -- Calculate night hours for this session
        IF night_start_time > night_end_time THEN
            -- Night period crosses midnight
            night_start_today := DATE(local_start_time) + night_start_time;
            night_end_today := DATE(local_start_time) + night_end_time;
            
            -- Check overlap with night period before midnight
            IF local_start_time < night_end_today AND local_end_time > (DATE(local_start_time)::timestamp) THEN
                temp_start := GREATEST(local_start_time, DATE(local_start_time)::timestamp);
                temp_end := LEAST(local_end_time, night_end_today);
                IF temp_end > temp_start THEN
                    night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
                END IF;
            END IF;
            
            -- Check overlap with night period after midnight
            IF local_start_time < (DATE(local_start_time) + INTERVAL '1 day')::timestamp AND local_end_time > night_start_today THEN
                temp_start := GREATEST(local_start_time, night_start_today);
                temp_end := LEAST(local_end_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
                IF temp_end > temp_start THEN
                    night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
                END IF;
            END IF;
        ELSE
            -- Night period within same day
            night_start_today := DATE(local_start_time) + night_start_time;
            night_end_today := DATE(local_start_time) + night_end_time;
            
            IF local_start_time < night_end_today AND local_end_time > night_start_today THEN
                temp_start := GREATEST(local_start_time, night_start_today);
                temp_end := LEAST(local_end_time, night_end_today);
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
    END LOOP;

    -- NUOVO: Gestione pausa pranzo per sessioni multiple
    total_raw_hours := total_work_minutes / 60.0;
    
    -- Applica la logica della pausa pranzo (stessa del trigger legacy)
    IF timesheet_record.lunch_start_time IS NOT NULL AND timesheet_record.lunch_end_time IS NOT NULL THEN
        -- MODALITÀ 1: Pausa libera - già gestita nelle sessioni, non sottrarre nulla
        -- (si assume che le sessioni già tengano conto delle pause)
        NULL;
        
    ELSIF timesheet_record.lunch_duration_minutes IS NOT NULL THEN
        -- MODALITÀ 2: Pausa specificata manualmente per questo timesheet
        IF timesheet_record.lunch_duration_minutes > 0 THEN
            total_work_minutes := total_work_minutes - timesheet_record.lunch_duration_minutes;
        END IF;
        -- Se lunch_duration_minutes = 0, non sottrae nulla (nessuna pausa)
        
    ELSE
        -- MODALITÀ 3: Pausa automatica basata su configurazione
        IF lunch_break_minutes > 0 AND total_raw_hours > lunch_break_min_hours THEN
            total_work_minutes := total_work_minutes - lunch_break_minutes;
        END IF;
    END IF;
    
    -- Assicurati che non vada sotto zero
    total_work_minutes := GREATEST(0, total_work_minutes);

    -- Calculate day info for overtime using first session
    SELECT start_time INTO local_start_time FROM public.timesheet_sessions 
    WHERE timesheet_id = timesheet_record.id AND session_type = 'work' 
    ORDER BY session_order LIMIT 1;
    
    IF local_start_time IS NOT NULL THEN
        local_start_time := local_start_time AT TIME ZONE 'Europe/Rome';
        
        CASE EXTRACT(DOW FROM (local_start_time)::date)
            WHEN 1 THEN day_name := 'lun';
            WHEN 2 THEN day_name := 'mar';
            WHEN 3 THEN day_name := 'mer';
            WHEN 4 THEN day_name := 'gio';
            WHEN 5 THEN day_name := 'ven';
            WHEN 6 THEN day_name := 'sab';
            WHEN 0 THEN day_name := 'dom';
        END CASE;

        is_saturday_calc := EXTRACT(DOW FROM (local_start_time)::date) = 6;

        -- Determine weekly hours configuration
        IF employee_settings_rec.user_id IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
            weekly_hours_config := employee_settings_rec.standard_weekly_hours;
        ELSIF company_settings_rec.company_id IS NOT NULL AND company_settings_rec.standard_weekly_hours IS NOT NULL THEN
            weekly_hours_config := company_settings_rec.standard_weekly_hours;
        ELSE
            weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
        END IF;

        standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

        -- Calculate overtime hours with new 'normale' logic
        IF employee_settings_rec.user_id IS NOT NULL THEN
            saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
        ELSIF company_settings_rec.company_id IS NOT NULL THEN
            saturday_handling_type := company_settings_rec.saturday_handling::text;
        ELSE
            saturday_handling_type := 'straordinario';
        END IF;

        IF is_saturday_calc THEN
            CASE saturday_handling_type
                WHEN 'trasferta' THEN
                    -- Tutte le ore sono ordinarie, nessun straordinario
                    calculated_overtime_hours := 0;
                    
                WHEN 'normale' THEN
                    -- NUOVO: Sabato normale - calcola straordinari basandosi su standard_weekly_hours
                    IF standard_daily_hours_for_day > 0 THEN
                        -- Ha ore ordinarie configurate per sabato
                        calculated_overtime_hours := GREATEST(0, ROUND(total_work_minutes / 60.0, 2) - standard_daily_hours_for_day);
                    ELSE
                        -- Nessuna ora ordinaria configurata per sabato = tutto straordinario
                        calculated_overtime_hours := ROUND(total_work_minutes / 60.0, 2);
                    END IF;
                    
                WHEN 'straordinario' THEN
                    -- Comportamento attuale: tutte le ore del sabato sono straordinarie
                    IF standard_daily_hours_for_day = 0 THEN
                        calculated_overtime_hours := ROUND(total_work_minutes / 60.0, 2);
                    ELSIF (total_work_minutes / 60.0) > standard_daily_hours_for_day THEN
                        calculated_overtime_hours := ROUND((total_work_minutes / 60.0) - standard_daily_hours_for_day, 2);
                    ELSE
                        calculated_overtime_hours := 0;
                    END IF;
                    
                ELSE
                    -- Default fallback
                    calculated_overtime_hours := ROUND(total_work_minutes / 60.0, 2);
            END CASE;
        ELSE
            -- Non è sabato: logica normale
            IF (total_work_minutes / 60.0) > standard_daily_hours_for_day THEN
                calculated_overtime_hours := ROUND((total_work_minutes / 60.0) - standard_daily_hours_for_day, 2);
            ELSE
                calculated_overtime_hours := 0;
            END IF;
        END IF;
    END IF;

    -- Update the timesheet record
    UPDATE public.timesheets 
    SET 
        total_hours = ROUND(total_work_minutes / 60.0, 2),
        overtime_hours = calculated_overtime_hours,
        night_hours = ROUND(GREATEST(0, night_overlap_minutes) / 60.0, 2),
        is_saturday = COALESCE(is_saturday_calc, false),
        updated_at = now()
    WHERE id = timesheet_record.id;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Forza il ricalcolo di tutti i timesheet con sessioni dal 1 settembre
UPDATE timesheets 
SET updated_at = NOW()
WHERE date >= '2025-09-01' 
  AND EXISTS (
    SELECT 1 FROM timesheet_sessions ts 
    WHERE ts.timesheet_id = timesheets.id
  );