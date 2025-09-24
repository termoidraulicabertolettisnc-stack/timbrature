-- Create a helper function to delete timesheet sessions for a user
CREATE OR REPLACE FUNCTION delete_user_timesheet_sessions(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete timesheet sessions for all timesheets belonging to the target user
  DELETE FROM timesheet_sessions 
  WHERE timesheet_id IN (
    SELECT id FROM timesheets WHERE user_id = target_user_id
  );
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION delete_user_timesheet_sessions(uuid) TO service_role;