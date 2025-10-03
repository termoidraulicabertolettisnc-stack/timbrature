-- =====================================================
-- PULIZIA FINALE: Rimuove tutti i trigger e funzioni obsolete
-- che fanno riferimento a standard_daily_hours
-- =====================================================

-- 1. Elimina TUTTI i trigger che usano le vecchie funzioni
DROP TRIGGER IF EXISTS calculate_timesheet_trigger ON timesheets;
DROP TRIGGER IF EXISTS calculate_timesheet_simple_trigger ON timesheets;
DROP TRIGGER IF EXISTS update_timesheet_hours ON timesheets;
DROP TRIGGER IF EXISTS recalculate_timesheet_on_session_change ON timesheet_sessions;

-- 2. Elimina TUTTE le vecchie funzioni di calcolo
DROP FUNCTION IF EXISTS calculate_timesheet_hours() CASCADE;
DROP FUNCTION IF EXISTS calculate_timesheet_simple() CASCADE;
DROP FUNCTION IF EXISTS update_timesheet_totals() CASCADE;

-- 3. Ricrea SOLO il trigger corretto che usa calculate_timesheet_with_config
CREATE OR REPLACE FUNCTION trigger_calculate_timesheet_simple()
RETURNS TRIGGER AS $$
DECLARE
    v_result RECORD;
    v_is_absence BOOLEAN;
BEGIN
    -- Determina se è un'assenza
    v_is_absence := COALESCE(NEW.is_absence, false);
    
    -- Se è DELETE, ignora
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    
    -- Se è un'assenza, azzera tutti i valori
    IF v_is_absence THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.lunch_duration_minutes := 0;
        NEW.night_hours := 0;
        RETURN NEW;
    END IF;
    
    -- Se mancano start_time o end_time, azzera
    IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
        NEW.total_hours := NULL;
        NEW.overtime_hours := NULL;
        NEW.lunch_duration_minutes := NULL;
        RETURN NEW;
    END IF;
    
    -- Calcola usando la funzione corretta
    SELECT * INTO v_result
    FROM calculate_timesheet_with_config(
        NEW.user_id,
        NEW.date,
        NEW.start_time,
        NEW.end_time,
        NEW.lunch_start_time,
        NEW.lunch_end_time,
        NEW.lunch_duration_minutes,
        v_is_absence
    );
    
    -- Applica i risultati
    NEW.total_hours := v_result.total_hours;
    NEW.overtime_hours := v_result.overtime_hours;
    NEW.lunch_duration_minutes := v_result.lunch_minutes_used;
    NEW.is_saturday := v_result.is_saturday;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Crea il trigger corretto
CREATE TRIGGER calculate_timesheet_simple_trigger
    BEFORE INSERT OR UPDATE ON timesheets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calculate_timesheet_simple();