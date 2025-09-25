-- CORREZIONE COMPLETA: Gestione avanzata della pausa pranzo
-- Supporta 3 modalità:
-- 1. Pausa libera: dipendenti timbrano entrata/uscita pausa (lunch_start_time/lunch_end_time)
-- 2. Pausa fissa: pausa automatica di X minuti se lavora > Y ore configurabili
-- 3. Nessuna pausa: 0 minuti di pausa

-- AGGIORNA IL TRIGGER CON LOGICA CORRETTA
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
    lunch_break_min_hours numeric := 6.0; -- Ore minime per attivare pausa automatica
    saturday_handling_type text;
    saturday_rate numeric;
    hours_worked_without_lunch numeric;
    
    -- CORREZIONE: Variabili per gestire sessioni multiple
    total_session_hours numeric := 0;
    session_count integer := 0;
    has_sessions boolean := false;
    session_rec record;
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

    -- Ottieni il nome del giorno della settimana
    CASE EXTRACT(DOW FROM NEW.date)
        WHEN 1 THEN day_name := 'lun';
        WHEN 2 THEN day_name := 'mar';
        WHEN 3 THEN day_name := 'mer';
        WHEN 4 THEN day_name := 'gio';
        WHEN 5 THEN day_name := 'ven';
        WHEN 6 THEN day_name := 'sab';
        WHEN 0 THEN day_name := 'dom';
    END CASE;

    -- Ottieni le impostazioni del dipendente (temporali)
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

    -- CONFIGURAZIONE PRIORITARIA: dipendente > azienda > default
    IF employee_settings_rec IS NOT NULL THEN
        -- Usa impostazioni dipendente
        weekly_hours_config := COALESCE(employee_settings_rec.standard_weekly_hours, 
                                       company_settings_rec.standard_weekly_hours,
                                       '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb);
                                       
        -- CORREZIONE: Pausa pranzo con ore minime configurabili
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
        
        -- CORREZIONE: Ore minime configurabili per attivare la pausa automatica
        lunch_break_min_hours := COALESCE(employee_settings_rec.lunch_break_min_hours,
                                         company_settings_rec.lunch_break_min_hours,
                                         6.0);
                                         
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text,
                                          company_settings_rec.saturday_handling::text,
                                          'straordinario');
                                          
    ELSIF company_settings_rec IS NOT NULL THEN
        -- Usa impostazioni aziendali
        weekly_hours_config := COALESCE(company_settings_rec.standard_weekly_hours,
                                       '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb);
        
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
        saturday_handling_type := COALESCE(company_settings_rec.saturday_handling::text, 'straordinario');
        
    ELSE
        -- Valori di default
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
        lunch_break_minutes := 60;
        lunch_break_min_hours := 6.0;
        saturday_handling_type := 'straordinario';
    END IF;

    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

    -- CORREZIONE SESSIONI MULTIPLE: Controlla se esistono sessioni
    SELECT COUNT(*) INTO session_count
    FROM public.timesheet_sessions ts
    WHERE ts.timesheet_id = NEW.id
      AND ts.start_time IS NOT NULL
      AND ts.end_time IS NOT NULL;
    
    has_sessions := session_count > 0;

    IF has_sessions THEN
        -- CALCOLO DA SESSIONI MULTIPLE
        total_session_hours := 0;
        
        FOR session_rec IN 
            SELECT start_time, end_time,
                   EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 as session_hours
            FROM public.timesheet_sessions 
            WHERE timesheet_id = NEW.id 
              AND start_time IS NOT NULL 
              AND end_time IS NOT NULL
        LOOP
            total_session_hours := total_session_hours + session_rec.session_hours;
        END LOOP;
        
        -- Per le sessioni multiple, la pausa pranzo dovrebbe essere già gestita negli orari delle sessioni
        -- Quindi usiamo il totale delle sessioni come ore finali
        NEW.total_hours := ROUND(total_session_hours, 2);
        
    ELSE
        -- CALCOLO DA TIMESHEET PRINCIPALE
        work_duration := NEW.end_time - NEW.start_time;
        hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
        
        -- CORREZIONE PRINCIPALE: Gestione intelligente pausa pranzo
        IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
            -- MODALITÀ 1: Pausa libera - dipendente ha timbrato entrata/uscita pausa
            lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
            work_duration := work_duration - lunch_duration;
            
        ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
            -- MODALITÀ 2: Pausa specificata manualmente per questo timesheet
            IF NEW.lunch_duration_minutes > 0 THEN
                work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
            END IF;
            -- Se lunch_duration_minutes = 0, non sottrae nulla (nessuna pausa)
            
        ELSE
            -- MODALITÀ 3: Pausa automatica basata su configurazione
            -- CORREZIONE: Usa ore minime configurabili invece di 6 fisso
            IF lunch_break_minutes > 0 AND hours_worked_without_lunch > lunch_break_min_hours THEN
                work_duration := work_duration - (lunch_break_minutes || ' minutes')::interval;
            END IF;
        END IF;

        -- Converti in ore decimali
        total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
        NEW.total_hours := ROUND(total_minutes / 60.0, 2);
    END IF;

    -- CALCOLO STRAORDINARI (uguale per sessioni multiple e singole)
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    IF is_saturday THEN
        CASE saturday_handling_type
            WHEN 'trasferta' THEN
                calculated_overtime_hours := 0;
            WHEN 'normale' THEN
                calculated_overtime_hours := GREATEST(0, NEW.total_hours - standard_daily_hours_for_day);
            ELSE -- 'straordinario'
                calculated_overtime_hours := NEW.total_hours;
        END CASE;
    ELSE
        calculated_overtime_hours := GREATEST(0, NEW.total_hours - standard_daily_hours_for_day);
    END IF;

    NEW.overtime_hours := calculated_overtime_hours;

    -- Calcolo ore notturne (semplificato per ora)
    calculated_night_hours := 0;
    NEW.night_hours := calculated_night_hours;

    -- Buono pasto (maggiore di 6 ore o personalizzabile)
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RETURN NEW;
END;
$function$;

-- COMMENT SULLA LOGICA
COMMENT ON FUNCTION public.calculate_timesheet_hours() IS 
'Calcola ore lavorate con gestione avanzata pausa pranzo:
1. Pausa libera: usa lunch_start_time/lunch_end_time se presenti
2. Pausa manuale: usa lunch_duration_minutes se specificato
3. Pausa automatica: sottrae lunch_break_minutes se ore > lunch_break_min_hours
Supporta sia timesheet singoli che sessioni multiple importate da Excel.';