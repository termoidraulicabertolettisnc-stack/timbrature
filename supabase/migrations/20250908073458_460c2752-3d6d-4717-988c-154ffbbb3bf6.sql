-- Fix security issue: Set search_path for the function
CREATE OR REPLACE FUNCTION public.set_timesheet_end_date()
RETURNS TRIGGER AS $$
BEGIN
    -- If end_time is before start_time, it means the session ends the next day
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        IF NEW.end_time::time < NEW.start_time::time THEN
            NEW.end_date := NEW.date + INTERVAL '1 day';
        ELSE
            NEW.end_date := NEW.date;
        END IF;
    ELSE
        NEW.end_date := NEW.date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;