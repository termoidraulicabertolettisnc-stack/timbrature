-- CORREZIONE COMPLETA: Trigger che calcola straordinari considerando sessioni multiple
-- Il problema era che il trigger calcolava straordinari solo sul timesheet principale,
-- ignorando le sessioni multiple importate da Excel

CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    -- CORREZIONE: Variabili per gestire sessioni multiple
    total_session_hours numeric := 0;
    session_count integer := 0;
    has_sessions boolean := false;
    session_rec record;
    
    -- Variables for night hours calculation
    work_start_time timestamp with time zone;
    work_end_time timestamp with time zone;
    night_start_today timestamp with time zone;
    night_end_tomorrow timestamp with time zone;
    night_overlap_minutes numeric := 0;
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

    -- Determina ore standard giornaliere
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
        standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
        standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);
        saturday_handling_type := company_settings_rec.saturday_handling::text;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
        standard_daily_hours_for_day := 8;
        saturday_handling_type := 'straordinario';
    END IF;

    -- Configura orari notturni
    IF employee_settings_rec IS NOT NULL THEN
        night_start_time := COALESCE(employee_settings_rec.night_shift_start, '22:00:00'::time);
        night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
    ELSIF company_settings_rec IS NOT NULL THEN
        night_start_time := company_settings_rec.night_shift_start;
        night_end_time := company_settings_rec.night_shift_end;
    ELSE
        night_start_time := '22:00:00'::time;
        night_end_time := '05:00:00'::time;
    END IF;

    -- CORREZIONE PRINCIPALE: Controlla se esistono sessioni multiple per questo timesheet
    SELECT COUNT(*) INTO session_count
    FROM public.timesheet_sessions ts
    WHERE ts.timesheet_id = NEW.id
      AND ts.start_time IS NOT NULL
      AND ts.end_time IS NOT NULL;
    
    has_sessions := session_count > 0;

    IF has_sessions THEN
        -- CORREZIONE: Se ha sessioni multiple, calcola le ore totali dalle sessioni
        total_session_hours := 0;
        calculated_night_hours := 0;
        
        -- Somma tutte le ore delle sessioni
        FOR session_rec IN 
            SELECT 
                start_time,
                end_time,
                EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 as session_hours
            FROM public.timesheet_sessions 
            WHERE timesheet_id = NEW.id 
              AND start_time IS NOT NULL 
              AND end_time IS NOT NULL
        LOOP
            total_session_hours := total_session_hours + session_rec.session_hours;
            
            -- Calcola ore notturne per questa sessione (semplificato)
            IF (session_rec.start_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
               (session_rec.start_time::time BETWEEN '00:00:00'::time AND night_end_time) OR
               (session_rec.end_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
               (session_rec.end_time::time BETWEEN '00:00:00'::time AND night_end_time) THEN
                calculated_night_hours := calculated_night_hours + session_rec.session_hours;
            END IF;
        END LOOP;
        
        -- Usa il totale delle sessioni per calcolare straordinari
        NEW.total_hours := ROUND(total_session_hours, 2);
        
    ELSE
        -- LOGICA ORIGINALE: Calcola dal timesheet principale se non ha sessioni
        
        -- Calcola la durata totale del lavoro
        work_duration := NEW.end_time - NEW.start_time;
        
        -- Sottrai la pausa pranzo se specificata
        IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
            lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
            work_duration := work_duration - lunch_duration;
        ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
            IF NEW.lunch_duration_minutes > 0 AND EXTRACT(EPOCH FROM work_duration) / 3600 > 6 THEN
                work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
            END IF;
        ELSE
            -- Pausa pranzo automatica se ha lavorato più di 6 ore
            IF EXTRACT(EPOCH FROM work_duration) / 3600 > 6 THEN
                work_duration := work_duration - '60 minutes'::interval;
            END IF;
        END IF;

        -- Converti in ore decimali
        total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
        NEW.total_hours := ROUND(total_minutes / 60.0, 2);
        
        -- Calcola ore notturne dal timesheet principale
        IF (NEW.start_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
           (NEW.start_time::time BETWEEN '00:00:00'::time AND night_end_time) OR
           (NEW.end_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
           (NEW.end_time::time BETWEEN '00:00:00'::time AND night_end_time) THEN
            calculated_night_hours := NEW.total_hours;
        END IF;
    END IF;

    -- CALCOLO STRAORDINARI UNIFICATO (sia per sessioni che timesheet normale)
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    -- Calcola ore straordinarie
    IF is_saturday AND saturday_handling_type = 'trasferta' THEN
        -- Sabato pagato in trasferte: non conta come straordinario
        calculated_overtime_hours := 0;
    ELSE
        -- Calcolo normale delle ore straordinarie (oltre le ore standard giornaliere)
        IF NEW.total_hours > standard_daily_hours_for_day THEN
            calculated_overtime_hours := NEW.total_hours - standard_daily_hours_for_day;
        ELSE
            calculated_overtime_hours := 0;
        END IF;
    END IF;

    NEW.overtime_hours := calculated_overtime_hours;
    NEW.night_hours := calculated_night_hours;

    -- Determina se ha diritto al buono pasto (se ha lavorato più di 6 ore)
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RETURN NEW;
END;
$function$;

-- TRIGGER AGGIUNTIVO: Ricalcola timesheet quando cambiano le sessioni
CREATE OR REPLACE FUNCTION public.recalculate_timesheet_on_session_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    -- Aggiorna il timesheet principale quando cambiano le sessioni
    UPDATE public.timesheets 
    SET updated_at = NOW()
    WHERE id = COALESCE(NEW.timesheet_id, OLD.timesheet_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Applica il trigger alle sessioni
DROP TRIGGER IF EXISTS recalculate_timesheet_on_session_change ON public.timesheet_sessions;
CREATE TRIGGER recalculate_timesheet_on_session_change
    AFTER INSERT OR UPDATE OR DELETE ON public.timesheet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.recalculate_timesheet_on_session_change();

-- COMANDO PER RICALCOLARE TUTTI I TIMESHEET ESISTENTI CON SESSIONI
-- (Da eseguire dopo aver applicato il trigger)
UPDATE public.timesheets 
SET updated_at = NOW()
WHERE id IN (
    SELECT DISTINCT timesheet_id 
    FROM public.timesheet_sessions
);