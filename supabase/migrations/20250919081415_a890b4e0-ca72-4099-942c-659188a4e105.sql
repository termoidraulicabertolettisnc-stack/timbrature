-- Fix admin access by replacing the RLS policy with a simpler approach
-- Drop the current policy that uses is_user_admin() 
DROP POLICY "Admins can view company profiles" ON public.profiles;

-- Create a new policy that uses direct JOIN logic instead of is_user_admin()
CREATE POLICY "Users can view own profile and admins can view company profiles" 
ON public.profiles FOR SELECT USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.role::text = 'amministratore'
    AND admin_profile.company_id = profiles.company_id
  )
);