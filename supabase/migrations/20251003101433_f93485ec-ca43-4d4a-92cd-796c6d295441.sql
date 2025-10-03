-- Fix calculate_timesheet_simple to remove reference to non-existent standard_daily_hours field
-- This trigger function was referencing an old field that has been replaced by standard_weekly_hours (jsonb)

CREATE OR REPLACE FUNCTION public.calculate_timesheet_simple()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
    v_calc RECORD;
    v_lunch_to_use INTEGER;
BEGIN
    -- Assenze = azzera tutto
    IF NEW.is_absence = true THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        NEW.meal_voucher_earned := false;
        NEW.is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
        RETURN NEW;
    END IF;
    
    -- Se mancano gli orari, esci
    IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- GESTIONE OVERRIDE PAUSA PRANZO
    -- Priorità: lunch_override_minutes > lunch_duration_minutes > config standard
    IF NEW.lunch_override_minutes IS NOT NULL THEN
        v_lunch_to_use := NEW.lunch_override_minutes;
    ELSE
        v_lunch_to_use := NEW.lunch_duration_minutes;
    END IF;
    
    -- USA LA FUNZIONE CHE SAPPIAMO FUNZIONA (calculate_timesheet_with_config)
    SELECT * INTO v_calc
    FROM calculate_timesheet_with_config(
        NEW.user_id,
        NEW.date,
        NEW.start_time,
        NEW.end_time,
        NEW.lunch_start_time,
        NEW.lunch_end_time,
        v_lunch_to_use,
        false
    );
    
    -- ASSEGNAZIONE DIRETTA E CHIARA
    NEW.total_hours := v_calc.total_hours::numeric;
    NEW.overtime_hours := v_calc.overtime_hours::numeric;
    
    -- Mantieni l'override se specificato, altrimenti usa il calcolato
    IF NEW.lunch_override_minutes IS NULL THEN
        NEW.lunch_duration_minutes := v_calc.lunch_minutes_used;
    END IF;
    
    NEW.is_saturday := v_calc.is_saturday;
    NEW.meal_voucher_earned := (v_calc.total_hours >= 6);
    NEW.night_hours := 0;
    
    RETURN NEW;
END;
$function$;