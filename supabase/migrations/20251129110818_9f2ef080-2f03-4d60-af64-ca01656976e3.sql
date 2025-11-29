-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage absences in their company" ON employee_absences;

-- Create a permissive policy for admins to manage absences
CREATE POLICY "Admins can manage absences in their company" 
ON employee_absences 
FOR ALL 
TO authenticated
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_absences.user_id 
    AND p1.company_id = p2.company_id 
    AND p1.company_id = employee_absences.company_id
  )
)
WITH CHECK (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_absences.user_id 
    AND p1.company_id = p2.company_id 
    AND p1.company_id = employee_absences.company_id
  )
);