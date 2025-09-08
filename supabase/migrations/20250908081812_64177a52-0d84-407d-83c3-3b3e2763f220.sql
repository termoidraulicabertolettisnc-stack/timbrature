-- Create the missing trigger for set_timesheet_end_date
CREATE TRIGGER trigger_set_timesheet_end_date
  BEFORE INSERT OR UPDATE ON public.timesheets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_timesheet_end_date();

-- Update existing records to have correct end_date based on the logic
UPDATE public.timesheets 
SET end_date = CASE 
  WHEN end_time IS NOT NULL AND start_time IS NOT NULL THEN
    CASE 
      WHEN end_time::time < start_time::time THEN date + INTERVAL '1 day'
      ELSE date
    END
  ELSE date
END
WHERE end_date IS NULL OR end_date = date;