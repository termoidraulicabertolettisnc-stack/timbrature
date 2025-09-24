-- CORREZIONE DEFINITIVA: Fix completo della logica employee_settings_found nella funzione calculate_timesheet_hours
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    work_duration interval;
    lunch_duration interval;
    total_minutes numeric;
    company_settings_rec record;
    employee_settings_rec record;
    night_start_time time;
    night_end_time time;
    calculated_night_hours numeric := 0;
    calculated_overtime_hours numeric := 0;
    standard_daily_hours_for_day integer := 8;
    weekly_hours_config jsonb;
    day_name text;
    is_saturday boolean;
    lunch_break_minutes integer := 60;
    lunch_break_min_hours numeric := 6;  -- Changed to numeric to match column type
    saturday_handling_type text;
    saturday_rate numeric;
    hours_worked_without_lunch numeric;
    
    -- Variables for night hours calculation (in local time)
    local_start_time timestamp without time zone;
    local_end_time timestamp without time zone;
    night_start_today timestamp without time zone;
    night_end_tomorrow timestamp without time zone;
    night_start_yesterday timestamp without time zone;
    night_end_today timestamp without time zone;
    night_overlap_minutes numeric := 0;
    temp_start timestamp without time zone;
    temp_end timestamp without time zone;
    
    -- Variables for lunch break overlap calculation
    lunch_overlap_seconds numeric := 0;
    shift_start timestamp with time zone;
    shift_end timestamp with time zone;
    lunch_start_tz timestamp with time zone;
    lunch_end_tz timestamp with time zone;
    
    -- Variables for employee settings lookup fix - CRITICAL FIX
    employee_settings_found boolean := FALSE;
BEGIN
    -- Se è un'assenza, non calcolare ore lavorate
    IF NEW.is_absence = true THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        RETURN NEW;
    END IF;

    -- Se non c'è end_time, non calcolare nulla
    IF NEW.end_time IS NULL OR NEW.start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- A) SOLUZIONE: Usa sempre il giorno locale coerente con le notturne
    local_start_time := NEW.start_time AT TIME ZONE 'Europe/Rome';
    local_end_time := NEW.end_time AT TIME ZONE 'Europe/Rome';
    
    -- Calcola il giorno della settimana in base al tempo locale (coerente con calcolo notturne)
    CASE EXTRACT(DOW FROM (local_start_time)::date)
        WHEN 1 THEN day_name := 'lun';
        WHEN 2 THEN day_name := 'mar';
        WHEN 3 THEN day_name := 'mer';
        WHEN 4 THEN day_name := 'gio';
        WHEN 5 THEN day_name := 'ven';
        WHEN 6 THEN day_name := 'sab';
        WHEN 0 THEN day_name := 'dom';
    END CASE;

    -- Determina se è sabato basandosi sul tempo locale
    is_saturday := EXTRACT(DOW FROM (local_start_time)::date) = 6;
    NEW.is_saturday := is_saturday;

    -- *** CRITICAL FIX: CORRETTA LOGICA PER EMPLOYEE SETTINGS LOOKUP ***
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = NEW.user_id
      AND (es.valid_from IS NULL OR es.valid_from <= NEW.date)
      AND (es.valid_to IS NULL OR es.valid_to >= NEW.date)
    ORDER BY es.valid_from DESC NULLS LAST, es.created_at DESC
    LIMIT 1;
    
    -- CORREGGO LA LOGICA DI CONTROLLO
    IF employee_settings_rec.user_id IS NOT NULL THEN
        employee_settings_found := TRUE;
    END IF;

    -- Get company settings by joining with profiles
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Determine weekly hours configuration - USA EMPLOYEE SETTINGS SE TROVATE
    IF employee_settings_found AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
    END IF;

    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

    -- *** CRITICAL FIX: CORRETTA PRIORITÀ EMPLOYEE > COMPANY SETTINGS ***
    IF employee_settings_found AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE employee_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE company_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
    ELSE
        lunch_break_minutes := 60;
    END IF;

    -- *** CRITICAL FIX: CORRETTA PRIORITÀ PER LUNCH_BREAK_MIN_HOURS ***
    IF employee_settings_found AND employee_settings_rec.lunch_break_min_hours IS NOT NULL THEN
        lunch_break_min_hours := employee_settings_rec.lunch_break_min_hours;
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.lunch_break_min_hours IS NOT NULL THEN
        lunch_break_min_hours := company_settings_rec.lunch_break_min_hours;
    ELSE
        lunch_break_min_hours := 6; -- Default fallback
    END IF;

    -- Determine other settings con priorità corretta
    IF employee_settings_found THEN
        night_start_time := COALESCE(employee_settings_rec.night_shift_start, '22:00:00'::time);
        night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
        saturday_rate := employee_settings_rec.saturday_hourly_rate;
    ELSIF company_settings_rec IS NOT NULL THEN
        night_start_time := company_settings_rec.night_shift_start;
        night_end_time := company_settings_rec.night_shift_end;
        saturday_handling_type := company_settings_rec.saturday_handling::text;
        saturday_rate := company_settings_rec.saturday_hourly_rate;
    ELSE
        night_start_time := '22:00:00'::time;
        night_end_time := '05:00:00'::time;
        saturday_handling_type := 'straordinario';
        saturday_rate := 10.00;
    END IF;

    -- B) SOLUZIONE: Calcola durata e applica pausa con sovrapposizione/cap
    shift_start := NEW.start_time;
    shift_end := NEW.end_time;
    work_duration := shift_end - shift_start;
    hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
    
    -- Calcolo effettivo pausa come sovrapposizione/cap
    lunch_overlap_seconds := 0;
    
    IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
        -- Caso 1: Orari specifici di pausa - calcola sovrapposizione
        lunch_start_tz := NEW.lunch_start_time;
        lunch_end_tz := NEW.lunch_end_time;
        
        -- Calcola sovrapposizione tra finestra pausa e turno
        IF lunch_end_tz > shift_start AND lunch_start_tz < shift_end THEN
            lunch_overlap_seconds := EXTRACT(EPOCH FROM (
                LEAST(shift_end, lunch_end_tz) - GREATEST(shift_start, lunch_start_tz)
            ));
            lunch_overlap_seconds := GREATEST(0, lunch_overlap_seconds);
        END IF;
        
    ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
        -- Caso 2: Durata specifica - cap alla durata del turno
        lunch_overlap_seconds := LEAST(
            EXTRACT(EPOCH FROM work_duration),
            (NEW.lunch_duration_minutes::numeric * 60)
        );
        
    ELSE
        -- Caso 3: Impostazioni dipendente/azienda - applica solo se turno > configurabile min hours e cap alla durata
        IF lunch_break_minutes > 0 AND hours_worked_without_lunch > lunch_break_min_hours THEN
            lunch_overlap_seconds := LEAST(
                EXTRACT(EPOCH FROM work_duration),
                (lunch_break_minutes::numeric * 60)
            );
        END IF;
    END IF;

    -- Applica la pausa calcolata (convertendo secondi in interval)
    work_duration := work_duration - (lunch_overlap_seconds || ' seconds')::interval;
    
    -- SOLUZIONE: Clamp a zero per sicurezza (evita durate negative)
    IF work_duration < INTERVAL '0' THEN
        work_duration := INTERVAL '0';
    END IF;

    -- C) SOLUZIONE: Conversioni con base corretta
    total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
    NEW.total_hours := ROUND(total_minutes / 60.0, 2);

    -- Calculate overtime hours (usando giorno locale)
    IF is_saturday THEN
        IF saturday_handling_type = 'trasferta' THEN
            calculated_overtime_hours := 0;
        ELSE
            IF standard_daily_hours_for_day = 0 THEN
                calculated_overtime_hours := NEW.total_hours;
            ELSIF NEW.total_hours > standard_daily_hours_for_day THEN
                calculated_overtime_hours := NEW.total_hours - standard_daily_hours_for_day;
            ELSE
                calculated_overtime_hours := 0;
            END IF;
        END IF;
    ELSE
        IF NEW.total_hours > standard_daily_hours_for_day THEN
            calculated_overtime_hours := NEW.total_hours - standard_daily_hours_for_day;
        ELSE
            calculated_overtime_hours := 0;
        END IF;
    END IF;
    
    NEW.overtime_hours := calculated_overtime_hours;

    -- D) SOLUZIONE: Night hours calculation
    night_overlap_minutes := 0;
    
    IF night_start_time > night_end_time THEN
        night_start_today := DATE(local_start_time) + night_start_time;
        night_end_tomorrow := DATE(local_start_time) + INTERVAL '1 day' + night_end_time;
        night_start_yesterday := DATE(local_start_time) - INTERVAL '1 day' + night_start_time;
        night_end_today := DATE(local_start_time) + night_end_time;
        
        IF local_start_time < night_end_today AND local_end_time > (DATE(local_start_time)::timestamp) THEN
            temp_start := GREATEST(local_start_time, DATE(local_start_time)::timestamp);
            temp_end := LEAST(local_end_time, night_end_today);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
        
        IF local_start_time < (DATE(local_start_time) + INTERVAL '1 day')::timestamp AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
        
        IF local_start_time < night_end_tomorrow AND local_end_time > (DATE(local_start_time) + INTERVAL '1 day')::timestamp THEN
            temp_start := GREATEST(local_start_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
            temp_end := LEAST(local_end_time, night_end_tomorrow);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
    ELSE
        night_start_today := DATE(local_start_time) + night_start_time;
        night_end_today := DATE(local_start_time) + night_end_time;
        
        IF local_start_time < night_end_today AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, night_end_today);
            night_overlap_minutes := EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
        END IF;
    END IF;
    
    calculated_night_hours := ROUND(GREATEST(0, night_overlap_minutes) / 60.0, 2);
    NEW.night_hours := calculated_night_hours;

    RETURN NEW;
END;
$function$;