-- Verifica e ripristina i trigger necessari per il calcolo delle ore
-- Prima, rimuovi eventuali trigger esistenti per evitare conflitti
DROP TRIGGER IF EXISTS calculate_timesheet_hours_trigger ON public.timesheets;
DROP TRIGGER IF EXISTS recalculate_on_session_change_trigger ON public.timesheet_sessions;

-- Crea trigger principale sui timesheets per calcolo legacy (quando non ci sono sessioni)
CREATE TRIGGER calculate_timesheet_hours_trigger
    BEFORE UPDATE OF start_time, end_time, lunch_start_time, lunch_end_time, lunch_duration_minutes, date
    ON public.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_timesheet_hours_legacy();

-- Crea trigger sulle sessioni per calcolo con sessioni multiple
CREATE TRIGGER recalculate_on_session_change_trigger
    AFTER INSERT OR UPDATE OR DELETE
    ON public.timesheet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_hours_on_session_change();

-- Forza il ricalcolo di tutti i timesheet di settembre per assicurarsi che i calcoli siano corretti
UPDATE public.timesheets 
SET updated_at = NOW()
WHERE date >= '2025-09-01' 
  AND date < '2025-10-01';