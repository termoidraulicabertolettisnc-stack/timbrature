-- Rimuovo i trigger duplicati per ripristinare il funzionamento corretto

-- Rimuovo i trigger duplicati sui timesheets
DROP TRIGGER IF EXISTS trg_normalize_lunch_fields ON public.timesheets;
DROP TRIGGER IF EXISTS trigger_set_timesheet_end_date ON public.timesheets;

-- Rimuovo i trigger duplicati sulle sessioni - tengo solo session_hours_trigger
DROP TRIGGER IF EXISTS calculate_hours_on_session_change_trigger ON public.timesheet_sessions;
DROP TRIGGER IF EXISTS recalculate_timesheet_hours_on_session_change ON public.timesheet_sessions;

-- Verifico che rimangano solo i trigger necessari:
-- Su timesheets: calculate_timesheet_hours_legacy_trigger, normalize_lunch_fields_trigger, set_timesheet_end_date_trigger
-- Su timesheet_sessions: session_hours_trigger