-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can manage absences in their company" ON employee_absences;

-- Create a function to check if user is a super admin (company_id = 00000000-0000-0000-0000-000000000001)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'amministratore'::user_role
    AND company_id = '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;

-- Create updated policy that allows super admins to manage all absences
-- and regular admins to manage only their company's absences
CREATE POLICY "Admins can manage absences in their company" 
ON employee_absences 
FOR ALL 
TO authenticated
USING (
  -- Super admin can manage all
  is_super_admin()
  OR
  -- Regular admin can manage only their company
  (
    is_user_admin() AND 
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p2.user_id = employee_absences.user_id 
      AND p1.company_id = p2.company_id 
      AND p1.company_id = employee_absences.company_id
    )
  )
)
WITH CHECK (
  -- Super admin can manage all
  is_super_admin()
  OR
  -- Regular admin can manage only their company
  (
    is_user_admin() AND 
    EXISTS (
      SELECT 1 FROM profiles p1, profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p2.user_id = employee_absences.user_id 
      AND p1.company_id = p2.company_id 
      AND p1.company_id = employee_absences.company_id
    )
  )
);