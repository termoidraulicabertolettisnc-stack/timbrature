-- 🔥 RICREAZIONE COMPLETA: Elimina e ricrea il trigger funzionante

-- 1. ELIMINA TUTTI I TRIGGER ESISTENTI SU TIMESHEETS
DROP TRIGGER IF EXISTS calculate_timesheet_hours_trigger ON timesheets;
DROP TRIGGER IF EXISTS calculate_timesheet_final_trigger ON timesheets; 
DROP TRIGGER IF EXISTS recalc_trigger ON timesheets;

-- 2. CREA FUNZIONE TRIGGER SEMPLIFICATA E FUNZIONANTE
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours_correct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    total_work_hours numeric := 0;
    session_count integer := 0;
    session_hours numeric := 0;
    final_hours numeric := 0;
BEGIN
    RAISE NOTICE 'TRIGGER START: ID=%, Date=%, User=%', NEW.id, NEW.date, NEW.user_id;
    
    -- Se è assenza, azzera tutto
    IF NEW.is_absence = true THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        RAISE NOTICE 'ABSENCE - Hours set to 0';
        RETURN NEW;
    END IF;

    -- Se mancano orari, esci
    IF NEW.end_time IS NULL OR NEW.start_time IS NULL THEN
        RAISE NOTICE 'MISSING TIMES - Skipping calculation';
        RETURN NEW;
    END IF;

    -- CONTROLLA SESSIONI
    SELECT COUNT(*) INTO session_count
    FROM timesheet_sessions 
    WHERE timesheet_id = NEW.id 
      AND start_time IS NOT NULL 
      AND end_time IS NOT NULL;
      
    RAISE NOTICE 'SESSION COUNT: %', session_count;

    IF session_count > 0 THEN
        -- CALCOLO CON SESSIONI
        SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0), 0)
        INTO session_hours
        FROM timesheet_sessions 
        WHERE timesheet_id = NEW.id 
          AND start_time IS NOT NULL 
          AND end_time IS NOT NULL;
          
        RAISE NOTICE 'HOURS FROM SESSIONS: %', session_hours;
        
        -- APPLICA PAUSA MANUALE SE SPECIFICATA
        IF NEW.lunch_duration_minutes IS NOT NULL AND NEW.lunch_duration_minutes > 0 THEN
            final_hours := session_hours - (NEW.lunch_duration_minutes::numeric / 60.0);
            RAISE NOTICE 'MANUAL LUNCH APPLIED: % minutes, Final: %', NEW.lunch_duration_minutes, final_hours;
        ELSE
            final_hours := session_hours;
            RAISE NOTICE 'NO MANUAL LUNCH, Final: %', final_hours;
        END IF;
        
    ELSE
        -- CALCOLO SENZA SESSIONI (METODO CLASSICO)
        total_work_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
        
        -- APPLICA PAUSA MANUALE SE SPECIFICATA
        IF NEW.lunch_duration_minutes IS NOT NULL AND NEW.lunch_duration_minutes > 0 THEN
            final_hours := total_work_hours - (NEW.lunch_duration_minutes::numeric / 60.0);
            RAISE NOTICE 'NO SESSIONS - MANUAL LUNCH APPLIED: % minutes, Final: %', NEW.lunch_duration_minutes, final_hours;
        ELSE
            final_hours := total_work_hours;
            RAISE NOTICE 'NO SESSIONS - NO MANUAL LUNCH, Final: %', final_hours;
        END IF;
    END IF;

    -- ASSEGNA RISULTATO FINALE
    NEW.total_hours := ROUND(final_hours, 2);
    
    -- CALCOLO STRAORDINARI SEMPLIFICATO (8 ore standard)
    NEW.overtime_hours := GREATEST(0, NEW.total_hours - 8);
    NEW.night_hours := 0;
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RAISE NOTICE 'FINAL RESULT: Total=%, Overtime=%', NEW.total_hours, NEW.overtime_hours;
    
    RETURN NEW;
END;
$function$;

-- 3. CREA TRIGGER CHE SI ATTIVA AD OGNI UPDATE
CREATE TRIGGER calculate_timesheet_hours_trigger
    BEFORE UPDATE ON timesheets
    FOR EACH ROW
    EXECUTE FUNCTION calculate_timesheet_hours_correct();

-- 4. TEST IMMEDIATO: Forza aggiornamento di Thomas
UPDATE timesheets 
SET updated_at = NOW()
WHERE user_id = (
    SELECT user_id 
    FROM profiles 
    WHERE email = 'thomas.bertoletti@bertolettigroup.com'
)
AND date = '2025-09-02';

-- 5. VERIFICA RISULTATO
SELECT 
    '✅ TEST FINALE' as test,
    date,
    lunch_duration_minutes as pausa_manuale,
    total_hours as ore_calcolate,
    CASE 
        WHEN total_hours = 9.5 THEN '🎉 RISOLTO!'
        WHEN total_hours = 10.0 THEN '😤 ANCORA SBAGLIATO'
        ELSE CONCAT('🤔 VALORE: ', total_hours::text)
    END as risultato
FROM timesheets t
JOIN profiles p ON t.user_id = p.user_id
WHERE p.email = 'thomas.bertoletti@bertolettigroup.com'
  AND t.date = '2025-09-02';