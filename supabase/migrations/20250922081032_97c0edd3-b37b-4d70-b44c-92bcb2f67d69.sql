-- Fix remaining search_path issue for set_timesheet_end_date function
CREATE OR REPLACE FUNCTION public.set_timesheet_end_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Determine the correct end_date based on start_time and end_time
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        -- If end_time already has a different date than NEW.date, use that date
        IF NEW.end_time::date > NEW.date THEN
            NEW.end_date := NEW.end_time::date;
        -- If end_time has same date but time is before start_time, it means next day
        ELSIF NEW.end_time::time < NEW.start_time::time THEN
            NEW.end_date := NEW.date + INTERVAL '1 day';
        ELSE
            NEW.end_date := NEW.date;
        END IF;
    ELSE
        NEW.end_date := NEW.date;
    END IF;
    
    RETURN NEW;
END;
$function$;