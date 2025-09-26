-- FIX IMMEDIATO: La pausa pranzo non viene sottratta dal trigger database
-- PROBLEMA: Il trigger attuale non sottrae la pausa pranzo correttamente

-- 1. ELIMINA TUTTI I TRIGGER CONFLIGGENTI E RICREA QUELLO CORRETTO
DROP TRIGGER IF EXISTS calculate_timesheet_hours_trigger ON public.timesheets;
DROP TRIGGER IF EXISTS calculate_timesheet_hours_legacy_trigger ON public.timesheets;
DROP TRIGGER IF EXISTS session_hours_trigger ON public.timesheet_sessions;
DROP TRIGGER IF EXISTS calculate_hours_on_session_change_trigger ON public.timesheet_sessions;

-- 2. CREA IL TRIGGER CORRETTO CHE GESTISCE PAUSA PRANZO E SESSIONI
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours_fixed()
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
    calculated_overtime_hours numeric := 0;
    standard_daily_hours_for_day integer := 8;
    weekly_hours_config jsonb;
    day_name text;
    is_saturday boolean;
    lunch_break_minutes integer := 60;
    lunch_break_min_hours numeric := 6.0;
    saturday_handling_type text;
    hours_worked_without_lunch numeric;
    
    -- Variabili per sessioni multiple
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

    -- Ottieni le impostazioni del dipendente
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = NEW.user_id
      AND (es.valid_from IS NULL OR es.valid_from <= NEW.date)
      AND (es.valid_to IS NULL OR es.valid_to >= NEW.date)
    ORDER BY es.valid_from DESC NULLS LAST
    LIMIT 1;

    -- Ottieni le impostazioni aziendali
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Configura le impostazioni di pausa pranzo
    -- PRIORITÀ: Dipendente (se specificato) → Azienda (obbligatorio)
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        -- Usa impostazioni dipendente specifiche
        CASE employee_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
        END CASE;
        lunch_break_min_hours := employee_settings_rec.lunch_break_min_hours;
    ELSE
        -- Usa impostazioni aziendali (OBBLIGATORIE - sempre presenti)
        CASE company_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
        END CASE;
        lunch_break_min_hours := company_settings_rec.lunch_break_min_hours;
    END IF;
    
    -- Configura orario settimanale
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    END IF;
    
    -- Configura gestione sabato
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.saturday_handling IS NOT NULL THEN
        saturday_handling_type := employee_settings_rec.saturday_handling::text;
    ELSE
        saturday_handling_type := company_settings_rec.saturday_handling::text;
    END IF;

    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

    -- CONTROLLA SE ESISTONO SESSIONI MULTIPLE
    SELECT COUNT(*) INTO session_count
    FROM public.timesheet_sessions ts
    WHERE ts.timesheet_id = NEW.id
      AND ts.start_time IS NOT NULL
      AND ts.end_time IS NOT NULL;
    
    has_sessions := session_count > 0;
    
    -- DEBUG: Log per capire cosa sta succedendo
    RAISE NOTICE 'TRIGGER DEBUG - ID: %, Date: %, Sessions: %, Lunch minutes: %, Min hours: %', 
        NEW.id, NEW.date, session_count, lunch_break_minutes, lunch_break_min_hours;

    IF has_sessions THEN
        -- SESSIONI MULTIPLE: Calcola dalle sessioni (pausa già inclusa negli orari)
        RAISE NOTICE 'CALCULATING FROM % SESSIONS', session_count;
        
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
            RAISE NOTICE 'Session: % hours', session_rec.session_hours;
        END LOOP;
        
        NEW.total_hours := ROUND(total_session_hours, 2);
        RAISE NOTICE 'Total from sessions: %', NEW.total_hours;
        
    ELSE
        -- TIMESHEET SINGOLO: Calcola la pausa pranzo
        RAISE NOTICE 'CALCULATING FROM SINGLE TIMESHEET';
        
        work_duration := NEW.end_time - NEW.start_time;
        hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
        
        RAISE NOTICE 'Raw hours: %, Lunch settings: % min after % hours', 
            hours_worked_without_lunch, lunch_break_minutes, lunch_break_min_hours;
        
        -- LOGICA PAUSA PRANZO CORRETTA
        IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
            -- MODALITÀ 1: Pausa timbrata manualmente (es: dipendenti con pausa libera)
            lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
            work_duration := work_duration - lunch_duration;
            RAISE NOTICE 'Manual lunch break: % minutes', EXTRACT(EPOCH FROM lunch_duration) / 60;
            
        ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
            -- MODALITÀ 2: Pausa specificata per questo timesheet specifico
            IF NEW.lunch_duration_minutes > 0 THEN
                work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
                RAISE NOTICE 'Custom lunch break: % minutes', NEW.lunch_duration_minutes;
            END IF;
            
        ELSE
            -- MODALITÀ 3: PAUSA AUTOMATICA DALLE CONFIGURAZIONI
            -- Applica la pausa configurata SOLO se ha lavorato più delle ore minime configurate
            IF lunch_break_minutes > 0 AND hours_worked_without_lunch > lunch_break_min_hours THEN
                work_duration := work_duration - (lunch_break_minutes || ' minutes')::interval;
                RAISE NOTICE 'AUTO LUNCH BREAK APPLIED: % minutes (worked %.2f > %.1f min hours)', 
                    lunch_break_minutes, hours_worked_without_lunch, lunch_break_min_hours;
            ELSE
                RAISE NOTICE 'NO LUNCH BREAK: % minutes configured, worked %.2f hours, min required %.1f', 
                    lunch_break_minutes, hours_worked_without_lunch, lunch_break_min_hours;
            END IF;
        END IF;

        total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
        NEW.total_hours := ROUND(total_minutes / 60.0, 2);
        
        RAISE NOTICE 'Final hours after lunch: %', NEW.total_hours;
    END IF;

    -- CALCOLO STRAORDINARI
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    IF is_saturday THEN
        CASE saturday_handling_type
            WHEN 'trasferta' THEN calculated_overtime_hours := 0;
            WHEN 'normale' THEN calculated_overtime_hours := GREATEST(0, NEW.total_hours - standard_daily_hours_for_day);
            ELSE calculated_overtime_hours := NEW.total_hours;
        END CASE;
    ELSE
        calculated_overtime_hours := GREATEST(0, NEW.total_hours - standard_daily_hours_for_day);
    END IF;

    NEW.overtime_hours := calculated_overtime_hours;
    NEW.night_hours := 0; -- Semplificato per ora
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RAISE NOTICE 'FINAL RESULT: Total: %, Overtime: %', NEW.total_hours, NEW.overtime_hours;

    RETURN NEW;
END;
$function$;

-- 3. APPLICA IL NUOVO TRIGGER
CREATE TRIGGER calculate_timesheet_hours_fixed_trigger
    BEFORE INSERT OR UPDATE ON public.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_timesheet_hours_fixed();

-- 4. RICALCOLA IL TIMESHEET DEL 02/09 PER TESTARE
UPDATE public.timesheets 
SET updated_at = NOW()
WHERE user_id = (SELECT user_id FROM profiles WHERE first_name = 'Thomas' AND last_name = 'Bertoletti')
  AND date = '2025-09-02';