-- Correggi la conversione del fuso orario nella funzione
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

    -- Ottieni il nome del giorno della settimana in italiano
    CASE EXTRACT(DOW FROM NEW.date)
        WHEN 1 THEN day_name := 'lun';
        WHEN 2 THEN day_name := 'mar';
        WHEN 3 THEN day_name := 'mer';
        WHEN 4 THEN day_name := 'gio';
        WHEN 5 THEN day_name := 'ven';
        WHEN 6 THEN day_name := 'sab';
        WHEN 0 THEN day_name := 'dom';
    END CASE;

    -- Ottieni le impostazioni del dipendente valide per questa data specifica
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = NEW.user_id
      AND es.valid_from <= NEW.date
      AND (es.valid_to IS NULL OR es.valid_to >= NEW.date)
    ORDER BY es.valid_from DESC
    LIMIT 1;

    -- Ottieni le impostazioni aziendali
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Determina le impostazioni da usare
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
    END IF;

    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

    -- Determina le impostazioni per lunch break, night hours e saturday handling
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE employee_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        night_start_time := COALESCE(employee_settings_rec.night_shift_start, '22:00:00'::time);
        night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
        saturday_rate := employee_settings_rec.saturday_hourly_rate;
    ELSIF company_settings_rec IS NOT NULL THEN
        CASE company_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        night_start_time := company_settings_rec.night_shift_start;
        night_end_time := company_settings_rec.night_shift_end;
        saturday_handling_type := company_settings_rec.saturday_handling::text;
        saturday_rate := company_settings_rec.saturday_hourly_rate;
    ELSE
        night_start_time := '22:00:00'::time;
        night_end_time := '05:00:00'::time;
        lunch_break_minutes := 60;
        saturday_handling_type := 'straordinario';
        saturday_rate := 10.00;
    END IF;

    -- Calcola la durata totale del lavoro
    work_duration := NEW.end_time - NEW.start_time;
    hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
    
    -- Gestione della pausa pranzo
    IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
        lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
        work_duration := work_duration - lunch_duration;
    ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
        IF NEW.lunch_duration_minutes > 0 THEN
            work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
        END IF;
    ELSE
        IF lunch_break_minutes > 0 AND hours_worked_without_lunch > 6 THEN
            work_duration := work_duration - (lunch_break_minutes || ' minutes')::interval;
        END IF;
    END IF;

    -- Converti in ore decimali
    total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
    NEW.total_hours := ROUND(total_minutes / 60.0, 2);

    -- Determina se è sabato
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    -- Calcola ore straordinarie
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

    -- FIXED: Calcola ore notturne in orario LOCALE usando una conversione semplice (+2 ore per l'estate italiana)
    -- Converti aggiungendo 2 ore per il fuso orario estivo italiano (CEST = UTC+2)
    local_start_time := (NEW.start_time AT TIME ZONE 'UTC' + INTERVAL '2 hours')::timestamp without time zone;
    local_end_time := (NEW.end_time AT TIME ZONE 'UTC' + INTERVAL '2 hours')::timestamp without time zone;
    
    night_overlap_minutes := 0;
    
    -- Se il periodo notturno attraversa la mezzanotte (es. 22:00-05:00)
    IF night_start_time > night_end_time THEN
        -- Definisci i periodi notturni in orario locale
        night_start_today := DATE(local_start_time) + night_start_time;
        night_end_tomorrow := DATE(local_start_time) + INTERVAL '1 day' + night_end_time;
        night_start_yesterday := DATE(local_start_time) - INTERVAL '1 day' + night_start_time;
        night_end_today := DATE(local_start_time) + night_end_time;
        
        -- Calcola sovrapposizione con la parte notturna del giorno precedente (se il turno inizia prima delle 05:00)
        IF local_start_time < night_end_today AND local_end_time > (DATE(local_start_time)::timestamp) THEN
            temp_start := GREATEST(local_start_time, DATE(local_start_time)::timestamp);
            temp_end := LEAST(local_end_time, night_end_today);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
        
        -- Calcola sovrapposizione con la parte notturna del giorno corrente (dopo le 22:00)
        IF local_start_time < (DATE(local_start_time) + INTERVAL '1 day')::timestamp AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
        
        -- Calcola sovrapposizione con la parte notturna del giorno successivo (prima delle 05:00 del giorno dopo)
        IF local_start_time < night_end_tomorrow AND local_end_time > (DATE(local_start_time) + INTERVAL '1 day')::timestamp THEN
            temp_start := GREATEST(local_start_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
            temp_end := LEAST(local_end_time, night_end_tomorrow);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
    ELSE
        -- Il periodo notturno è nello stesso giorno (es. 01:00-06:00)
        night_start_today := DATE(local_start_time) + night_start_time;
        night_end_today := DATE(local_start_time) + night_end_time;
        
        IF local_start_time < night_end_today AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, night_end_today);
            night_overlap_minutes := EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
        END IF;
    END IF;
    
    -- Converte i minuti in ore e arrotonda
    calculated_night_hours := ROUND(GREATEST(0, night_overlap_minutes) / 60.0, 2);
    NEW.night_hours := calculated_night_hours;

    RETURN NEW;
END;
$function$;

-- Forza il ricalcolo
UPDATE timesheets 
SET start_time = start_time
WHERE user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Mihai') 
AND date BETWEEN '2025-08-04' AND '2025-08-06';