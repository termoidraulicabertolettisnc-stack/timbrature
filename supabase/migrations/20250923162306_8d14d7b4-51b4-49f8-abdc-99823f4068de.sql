-- Fix critical security vulnerability in profiles table RLS policy
-- Current policy allows any admin to access all profiles across companies
-- New policy restricts admins to only access profiles within their own company

-- First, drop the existing overly permissive policy
DROP POLICY IF EXISTS "profiles_full_access" ON public.profiles;

-- Create new secure policies that restrict admin access by company
-- Policy 1: Users can manage their own profile
CREATE POLICY "users_own_profile_access" 
ON public.profiles 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 2: Admins can only access profiles within their own company
CREATE POLICY "admins_company_profiles_access" 
ON public.profiles 
FOR ALL 
USING (
  is_admin() AND EXISTS (
    SELECT 1 FROM public.profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.role = 'amministratore'::user_role
  )
)
WITH CHECK (
  is_admin() AND EXISTS (
    SELECT 1 FROM public.profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
    AND admin_profile.role = 'amministratore'::user_role
  )
);