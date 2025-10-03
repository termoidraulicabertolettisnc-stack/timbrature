-- Remove obsolete trigger and function causing 400 errors on timesheet_sessions updates

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS update_timesheet_from_sessions_trigger ON public.timesheet_sessions;

-- Drop the obsolete function
DROP FUNCTION IF EXISTS public.update_timesheet_from_sessions();

-- Ensure only the correct trigger exists on timesheets table
-- This trigger will handle all calculations when timesheets are updated
-- (already created in previous migration, this is just a safety check)