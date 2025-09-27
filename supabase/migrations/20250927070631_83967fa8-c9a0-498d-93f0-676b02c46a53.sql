-- 🔧 CORREZIONE DEFINITIVA: Bug nella gestione lunch_duration_minutes per sessioni multiple
-- Il problema è nella sezione "MODALITÀ 2" del trigger

CREATE OR REPLACE FUNCTION public.calculate_timesheet_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    work_duration interval;
    total_minutes numeric;
    company_settings_rec record;
    employee_settings_rec record;
    calculated_overtime_hours numeric := 0;
    standard_daily_hours_for_day integer := 8;
    weekly_hours_config jsonb;
    day_name text;
    is_saturday boolean;
    lunch_break_minutes integer := 30;
    lunch_break_min_hours numeric := 6.0;
    saturday_handling_type text;
    hours_worked_without_lunch numeric;
    
    -- Variabili per sessioni multiple
    total_session_hours numeric := 0;
    session_count integer := 0;
    has_sessions boolean := false;
    session_rec record;
BEGIN
    -- Se è un'assenza, azzeramento
    IF NEW.is_absence = true THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        RETURN NEW;
    END IF;

    -- Se mancano orari, non calcolare
    IF NEW.end_time IS NULL OR NEW.start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determina il giorno della settimana
    CASE EXTRACT(DOW FROM NEW.date)
        WHEN 1 THEN day_name := 'lun';
        WHEN 2 THEN day_name := 'mar';
        WHEN 3 THEN day_name := 'mer';
        WHEN 4 THEN day_name := 'gio';
        WHEN 5 THEN day_name := 'ven';
        WHEN 6 THEN day_name := 'sab';
        WHEN 0 THEN day_name := 'dom';
    END CASE;

    -- Ottieni impostazioni dipendente
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = NEW.user_id
      AND (es.valid_from IS NULL OR es.valid_from <= NEW.date)
      AND (es.valid_to IS NULL OR es.valid_to >= NEW.date)
    ORDER BY es.valid_from DESC NULLS LAST
    LIMIT 1;

    -- Ottieni impostazioni aziendali
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Configura pausa pranzo
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE employee_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 30;
        END CASE;
        lunch_break_min_hours := COALESCE(employee_settings_rec.lunch_break_min_hours, 6.0);
    ELSIF company_settings_rec IS NOT NULL THEN
        CASE company_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 30;
        END CASE;
        lunch_break_min_hours := COALESCE(company_settings_rec.lunch_break_min_hours, 6.0);
    END IF;

    -- CONTROLLA SESSIONI MULTIPLE
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
        
        -- 🔧 CORREZIONE CRITICA: Gestione lunch_duration_minutes per sessioni multiple
        IF NEW.lunch_duration_minutes IS NOT NULL THEN
            -- MODALITÀ 2: Pausa specificata manualmente per questo timesheet
            IF NEW.lunch_duration_minutes > 0 THEN
                total_session_hours := total_session_hours - (NEW.lunch_duration_minutes::numeric / 60.0);
            END IF;
        ELSE
            -- MODALITÀ 3: Pausa automatica dalla configurazione
            -- Applica pausa pranzo automatica se applicabile
            hours_worked_without_lunch := total_session_hours;
            IF lunch_break_minutes > 0 AND hours_worked_without_lunch > lunch_break_min_hours THEN
                total_session_hours := total_session_hours - (lunch_break_minutes::numeric / 60.0);
            END IF;
        END IF;
        
        NEW.total_hours := ROUND(total_session_hours, 2);
        
    ELSE
        -- CALCOLO DA TIMESHEET SINGOLO
        work_duration := NEW.end_time - NEW.start_time;
        hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
        
        -- MODALITÀ 1: Pausa timbrata manualmente
        IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
            work_duration := work_duration - (NEW.lunch_end_time - NEW.lunch_start_time);
            
        -- MODALITÀ 2: Pausa specificata per questo timesheet
        ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
            IF NEW.lunch_duration_minutes > 0 THEN
                work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
            END IF;
            
        -- MODALITÀ 3: Pausa automatica dalla configurazione
        ELSE
            IF lunch_break_minutes > 0 AND hours_worked_without_lunch > lunch_break_min_hours THEN
                work_duration := work_duration - (lunch_break_minutes || ' minutes')::interval;
            END IF;
        END IF;

        -- Converti in ore decimali
        total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
        NEW.total_hours := ROUND(total_minutes / 60.0, 2);
    END IF;

    -- CALCOLO STRAORDINARI (rimane invariato)
    -- Configura ore standard giornaliere
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSIF company_settings_rec IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
    END IF;
    
    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);
    
    -- Configura gestione sabato
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.saturday_handling IS NOT NULL THEN
        saturday_handling_type := employee_settings_rec.saturday_handling::text;
    ELSIF company_settings_rec IS NOT NULL THEN
        saturday_handling_type := company_settings_rec.saturday_handling::text;
    ELSE
        saturday_handling_type := 'straordinario';
    END IF;

    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    -- Calcola straordinari
    IF is_saturday AND saturday_handling_type = 'trasferta' THEN
        calculated_overtime_hours := 0;
    ELSE
        calculated_overtime_hours := GREATEST(0, NEW.total_hours - standard_daily_hours_for_day);
    END IF;

    NEW.overtime_hours := calculated_overtime_hours;
    NEW.night_hours := 0;
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RETURN NEW;
END;
$function$;

-- 🧪 TEST IMMEDIATO: Forza il ricalcolo di Thomas per il 02/09
UPDATE timesheets 
SET updated_at = NOW()
WHERE user_id = (
    SELECT user_id 
    FROM profiles 
    WHERE email = 'thomas.bertoletti@bertolettigroup.com'
)
AND date = '2025-09-02';

-- 🔍 VERIFICA IMMEDIATA: Controlla se il calcolo è ora corretto
SELECT 
    '🎯 VERIFICA POST-CORREZIONE' as test,
    date,
    total_hours as ore_calcolate,
    lunch_duration_minutes as pausa_manuale,
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0 as ore_totali,
    CASE 
        WHEN total_hours = 9.5 THEN '✅ CORRETTO (9.5 ore)'
        WHEN total_hours = 10.0 THEN '❌ ANCORA SBAGLIATO (10.0 ore)'
        ELSE CONCAT('⚠️ VALORE INASPETTATO: ', total_hours::text, ' ore')
    END as risultato
FROM timesheets t
JOIN profiles p ON t.user_id = p.user_id
WHERE p.email = 'thomas.bertoletti@bertolettigroup.com'
  AND t.date = '2025-09-02';