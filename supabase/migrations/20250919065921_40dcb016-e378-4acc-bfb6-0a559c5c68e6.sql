-- Fix the RLS policy on profiles table to allow admins to view company employees

-- Drop the existing incorrect policy
DROP POLICY "Admins can view company profiles" ON public.profiles;

-- Create the correct policy that checks if the querying user is admin
CREATE POLICY "Admins can view company profiles" ON public.profiles
FOR SELECT USING (
  auth.uid() = user_id OR 
  (is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles admin_profile 
    WHERE admin_profile.user_id = auth.uid() 
    AND admin_profile.company_id = profiles.company_id
  ))
);