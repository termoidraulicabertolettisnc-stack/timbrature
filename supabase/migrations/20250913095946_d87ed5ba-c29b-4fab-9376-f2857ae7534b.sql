-- Fix security issue: Set search_path for the function I created
CREATE OR REPLACE FUNCTION sync_employee_settings_structure()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When company settings are updated, ensure all employees in this company 
  -- have the same structure available in their employee_settings
  -- This function will be enhanced in the application layer
  RETURN NEW;
END;
$$;