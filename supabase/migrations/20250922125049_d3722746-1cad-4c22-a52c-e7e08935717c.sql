-- Force recalculation of all timesheets to use the new configurable lunch_break_min_hours
UPDATE public.timesheets
SET updated_at = now()
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;