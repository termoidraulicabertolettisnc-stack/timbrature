-- Create a function to clean up Lorenzo's test data
CREATE OR REPLACE FUNCTION public.cleanup_lorenzo_test_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Delete timesheets for Lorenzo in August 2025
  DELETE FROM public.timesheets 
  WHERE user_id = '04610512-1818-4582-bf83-d69329b13ba8'
    AND date >= '2025-08-01' 
    AND date <= '2025-08-31';
    
  -- Note: timesheet_sessions will be deleted automatically by cascade
END;
$$;