-- Fix infinite recursion in profiles RLS policies
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can view all profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Admins can insert new profiles for their company" ON profiles;

-- Create new policies that avoid recursion
CREATE POLICY "Users can view their own profile" ON profiles
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON profiles  
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view profiles in company" ON profiles
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.role = 'amministratore'::user_role
    AND admin_profile.company_id = profiles.company_id
  )
);

CREATE POLICY "Admins can insert profiles" ON profiles
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.role = 'amministratore'::user_role
    AND admin_profile.company_id = profiles.company_id
  )
);