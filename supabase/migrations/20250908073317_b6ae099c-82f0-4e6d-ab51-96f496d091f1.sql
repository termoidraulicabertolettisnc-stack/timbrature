-- Add end_date field to timesheets table for multi-day sessions
ALTER TABLE public.timesheets 
ADD COLUMN end_date DATE NULL;

-- Update existing records where end_time < start_time to set end_date to next day
UPDATE public.timesheets 
SET end_date = date + INTERVAL '1 day'
WHERE end_time IS NOT NULL 
  AND start_time IS NOT NULL 
  AND end_time::time < start_time::time;

-- Create a function to automatically set end_date when inserting/updating timesheets
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
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set end_date
CREATE TRIGGER set_timesheet_end_date_trigger
    BEFORE INSERT OR UPDATE ON public.timesheets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_timesheet_end_date();