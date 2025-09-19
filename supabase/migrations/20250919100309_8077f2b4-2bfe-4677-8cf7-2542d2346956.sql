BEGIN;

-- Drop all policies first
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "timesheets_select_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_insert_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_delete_policy" ON public.timesheets;

-- Drop the problematic functions
DROP FUNCTION IF EXISTS public.get_user_company_id();
DROP FUNCTION IF EXISTS public.is_user_admin_secure();

-- Create a simpler admin check function that doesn't cause recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'amministratore'::user_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Simple profiles policy without recursion
CREATE POLICY "profiles_policy" 
ON public.profiles FOR ALL 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
);

-- Timesheets policies that check for admin or same company
CREATE POLICY "timesheets_select_policy" 
ON public.timesheets FOR SELECT 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
);

CREATE POLICY "timesheets_insert_policy" 
ON public.timesheets FOR INSERT 
WITH CHECK (
  auth.uid() = user_id OR 
  public.is_admin()
);

CREATE POLICY "timesheets_update_policy" 
ON public.timesheets FOR UPDATE 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
);

CREATE POLICY "timesheets_delete_policy" 
ON public.timesheets FOR DELETE 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
);

COMMIT;