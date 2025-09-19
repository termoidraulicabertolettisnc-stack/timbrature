BEGIN;

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can insert timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can update timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can delete timesheets in their company" ON public.timesheets;

-- Create security definer function to get user's company
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_user_admin_secure()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'amministratore'::user_role
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Recreate profiles policies without recursion
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view profiles in their company" 
ON public.profiles FOR SELECT 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin_secure() AND company_id = public.get_user_company_id())
);

-- Recreate timesheets policies using security definer functions
CREATE POLICY "Users can view own timesheets" 
ON public.timesheets FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view timesheets in their company" 
ON public.timesheets FOR SELECT 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin_secure() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = timesheets.user_id 
    AND p.company_id = public.get_user_company_id()
  ))
);

CREATE POLICY "Users can insert own timesheets" 
ON public.timesheets FOR INSERT 
WITH CHECK (auth.uid() = user_id AND auth.uid() = created_by);

CREATE POLICY "Admins can insert timesheets in their company" 
ON public.timesheets FOR INSERT 
WITH CHECK (
  auth.uid() = user_id OR 
  (public.is_user_admin_secure() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = timesheets.user_id 
    AND p.company_id = public.get_user_company_id()
  ))
);

CREATE POLICY "Users can update own timesheets" 
ON public.timesheets FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update timesheets in their company" 
ON public.timesheets FOR UPDATE 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin_secure() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = timesheets.user_id 
    AND p.company_id = public.get_user_company_id()
  ))
);

CREATE POLICY "Users can delete own timesheets" 
ON public.timesheets FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete timesheets in their company" 
ON public.timesheets FOR DELETE 
USING (
  auth.uid() = user_id OR 
  (public.is_user_admin_secure() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = timesheets.user_id 
    AND p.company_id = public.get_user_company_id()
  ))
);

COMMIT;