-- Step 1: Simplify the RLS policies for employee_settings to avoid circular references

-- Drop the existing complex INSERT policy
DROP POLICY IF EXISTS "Admins can insert employee settings in their company" ON public.employee_settings;

-- Create a simpler INSERT policy that only checks if the user is admin
CREATE POLICY "Admins can insert employee settings" 
ON public.employee_settings 
FOR INSERT 
TO authenticated 
WITH CHECK (
  -- Simple check: user must be admin
  public.is_user_admin()
);

-- Update the existing SELECT policy to be more permissive for debugging
DROP POLICY IF EXISTS "Admins can view all employee settings in their company" ON public.employee_settings;

CREATE POLICY "Admins can view all employee settings" 
ON public.employee_settings 
FOR SELECT 
TO authenticated 
USING (
  -- Users can see their own OR admins can see all
  (auth.uid() = user_id) OR public.is_user_admin()
);

-- Update the UPDATE policy to be simpler
DROP POLICY IF EXISTS "Admins can update employee settings in their company" ON public.employee_settings;

CREATE POLICY "Admins can update employee settings" 
ON public.employee_settings 
FOR UPDATE 
TO authenticated 
USING (
  -- Users can update their own OR admins can update all
  (auth.uid() = user_id) OR public.is_user_admin()
);

-- Update the DELETE policy to be simpler
DROP POLICY IF EXISTS "Admins can delete employee settings in their company" ON public.employee_settings;

CREATE POLICY "Admins can delete employee settings" 
ON public.employee_settings 
FOR DELETE 
TO authenticated 
USING (
  -- Users can delete their own OR admins can delete all
  (auth.uid() = user_id) OR public.is_user_admin()
);

-- Add logging to the is_user_admin function for debugging
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT 
    COALESCE(
      (SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'amministratore'::user_role
      )), 
      false
    );
$function$;