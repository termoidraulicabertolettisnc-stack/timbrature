-- Fix admin access by completely rebuilding the profiles table policies
-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile and admins can view company profiles" ON public.profiles;

-- Create a simple and reliable policy for profile access
CREATE POLICY "Profile access policy" 
ON public.profiles FOR SELECT USING (
  -- Users can always see their own profile
  auth.uid() = user_id 
  OR 
  -- Admins can see profiles within their company
  EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.role = 'amministratore'::user_role
    AND admin_profile.company_id = profiles.company_id
  )
);