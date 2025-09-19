BEGIN;

-- Remove ALL existing policies on profiles
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their company" ON public.profiles;
DROP POLICY IF EXISTS "profiles_policy" ON public.profiles;

-- Remove ALL existing policies on timesheets
DROP POLICY IF EXISTS "Users can delete their own timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Users can insert their own timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Users can update their own timesheets" ON public.timesheets;  
DROP POLICY IF EXISTS "Users can view their own timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_delete_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_insert_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_select_policy" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_policy" ON public.timesheets;

-- Create simple, non-recursive policies
CREATE POLICY "profiles_full_access" 
ON public.profiles FOR ALL 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
);

CREATE POLICY "timesheets_full_access" 
ON public.timesheets FOR ALL 
USING (
  auth.uid() = user_id OR 
  public.is_admin()
)
WITH CHECK (
  auth.uid() = user_id OR 
  public.is_admin()
);

COMMIT;