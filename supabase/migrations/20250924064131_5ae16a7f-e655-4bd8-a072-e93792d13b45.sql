-- CRITICAL FIX: Remove the problematic RLS policy causing infinite recursion
-- The current policy on profiles table calls is_admin() which queries profiles, creating infinite loop

-- Drop the problematic policies that cause recursion
DROP POLICY IF EXISTS "admins_company_profiles_access" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile_access" ON public.profiles;

-- Create a security definer function that doesn't cause recursion
-- This function will be used by RLS policies to check admin status safely
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_result user_role;
BEGIN
    SELECT role INTO user_role_result
    FROM public.profiles 
    WHERE user_id = auth.uid()
    LIMIT 1;
    
    RETURN user_role_result = 'amministratore'::user_role;
END;
$$;

-- Create safe RLS policies that don't cause recursion
-- Policy 1: Users can manage their own profile
CREATE POLICY "users_own_profile_access" 
ON public.profiles 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 2: Admins can access profiles within their company using the safe function
CREATE POLICY "admins_company_profiles_access" 
ON public.profiles 
FOR ALL 
USING (
  public.is_user_admin() AND EXISTS (
    SELECT 1 FROM public.profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.role = 'amministratore'::user_role
  )
)
WITH CHECK (
  public.is_user_admin() AND EXISTS (
    SELECT 1 FROM public.profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.role = 'amministratore'::user_role
  )
);