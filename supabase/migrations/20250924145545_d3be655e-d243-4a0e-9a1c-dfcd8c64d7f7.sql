-- Add foreign key constraint between timesheets and timesheet_sessions
ALTER TABLE public.timesheet_sessions 
ADD CONSTRAINT timesheet_sessions_timesheet_id_fkey 
FOREIGN KEY (timesheet_id) REFERENCES public.timesheets(id) ON DELETE CASCADE;