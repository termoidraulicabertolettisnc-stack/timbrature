-- Fix infinite recursion by creating a security definer function (corrected syntax)
-- First, create a security definer function to check admin role safely
CREATE OR REPLACE FUNCTION public.get_current_user_role_and_company()
RETURNS TABLE(user_role user_role, user_company_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT p.role, p.company_id 
  FROM public.profiles p 
  WHERE p.user_id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Profile access policy" ON public.profiles;

-- Create a new policy using the security definer function
CREATE POLICY "Profile access policy" 
ON public.profiles FOR SELECT USING (
  -- Users can always see their own profile
  auth.uid() = user_id 
  OR 
  -- Admins can see profiles within their company (using security definer function)
  EXISTS (
    SELECT 1 
    FROM public.get_current_user_role_and_company() AS user_info
    WHERE user_info.user_role = 'amministratore'::user_role 
    AND user_info.user_company_id = profiles.company_id
  )
);