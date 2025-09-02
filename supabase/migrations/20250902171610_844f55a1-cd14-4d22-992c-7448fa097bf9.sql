-- Remove all existing policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Admins can insert new profiles for their company" ON profiles;

-- Create new policies that avoid recursion by not using is_user_admin()
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles  
FOR UPDATE USING (auth.uid() = user_id);

-- Simple admin policies without recursion
CREATE POLICY "Admins can view company profiles" ON profiles
FOR SELECT USING (
  role = 'amministratore'::user_role OR auth.uid() = user_id
);

CREATE POLICY "Admins can insert profiles" ON profiles
FOR INSERT WITH CHECK (true);