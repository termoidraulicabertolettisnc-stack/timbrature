-- Fix infinite recursion in RLS policies
-- The problem is that policies are referencing the profiles table in their WHERE clauses,
-- causing infinite recursion when checking permissions

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert new profiles for their company" ON public.profiles;

-- Create a security definer function to check if user is admin
-- This function bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'amministratore'::user_role
  );
$$;

-- Recreate the policies using the function
CREATE POLICY "Admins can view all profiles in their company" 
ON public.profiles 
FOR SELECT 
USING (
  CASE 
    WHEN public.is_user_admin() THEN 
      EXISTS (
        SELECT 1 FROM profiles admin_profile 
        WHERE admin_profile.user_id = auth.uid() 
        AND admin_profile.company_id = profiles.company_id
      )
    ELSE false
  END
);

CREATE POLICY "Admins can insert new profiles for their company" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  public.is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
  )
);

-- Fix other tables with similar issues
-- Companies table
DROP POLICY IF EXISTS "Users can view their company" ON public.companies;
CREATE POLICY "Users can view their company" 
ON public.companies 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = companies.id
  )
);

-- Fix company_settings policies
DROP POLICY IF EXISTS "Admins can manage their company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Users can view their company settings" ON public.company_settings;

CREATE POLICY "Admins can manage their company settings" 
ON public.company_settings 
FOR ALL 
USING (
  public.is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = company_settings.company_id
  )
);

CREATE POLICY "Users can view their company settings" 
ON public.company_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = company_settings.company_id
  )
);

-- Fix projects policies
DROP POLICY IF EXISTS "Admins can manage projects in their company" ON public.projects;
DROP POLICY IF EXISTS "Users can view projects in their company" ON public.projects;

CREATE POLICY "Admins can manage projects in their company" 
ON public.projects 
FOR ALL 
USING (
  public.is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = projects.company_id
  )
);

CREATE POLICY "Users can view projects in their company" 
ON public.projects 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = projects.company_id
  )
);

-- Fix timesheets policies
DROP POLICY IF EXISTS "Admins can view all timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can update timesheets in their company" ON public.timesheets;

CREATE POLICY "Admins can view all timesheets in their company" 
ON public.timesheets 
FOR SELECT 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin() AND 
   EXISTS (
     SELECT 1 FROM profiles p1, profiles p2 
     WHERE p1.user_id = auth.uid() 
     AND p2.user_id = timesheets.user_id 
     AND p1.company_id = p2.company_id
   ))
);

CREATE POLICY "Admins can update timesheets in their company" 
ON public.timesheets 
FOR UPDATE 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin() AND 
   EXISTS (
     SELECT 1 FROM profiles p1, profiles p2 
     WHERE p1.user_id = auth.uid() 
     AND p2.user_id = timesheets.user_id 
     AND p1.company_id = p2.company_id
   ))
);

-- Fix audit_logs policies
DROP POLICY IF EXISTS "Admins can view audit logs for their company" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs for their company" 
ON public.audit_logs 
FOR SELECT 
USING (
  public.is_user_admin()
);