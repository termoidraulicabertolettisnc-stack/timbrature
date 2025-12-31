-- Drop existing INSERT policy that restricts by company
DROP POLICY IF EXISTS "Admins can insert overtime conversions in their company" ON public.employee_overtime_conversions;

-- Create new INSERT policy that allows all admins to insert
CREATE POLICY "Admins can insert overtime conversions" 
ON public.employee_overtime_conversions 
FOR INSERT 
WITH CHECK (is_admin());

-- Also update the UPDATE policy to allow cross-company updates
DROP POLICY IF EXISTS "Admins can update overtime conversions in their company" ON public.employee_overtime_conversions;

CREATE POLICY "Admins can update overtime conversions" 
ON public.employee_overtime_conversions 
FOR UPDATE 
USING (is_admin());

-- Update the DELETE policy as well
DROP POLICY IF EXISTS "Admins can delete overtime conversions in their company" ON public.employee_overtime_conversions;

CREATE POLICY "Admins can delete overtime conversions" 
ON public.employee_overtime_conversions 
FOR DELETE 
USING (is_admin());

-- Update the SELECT policy for admins
DROP POLICY IF EXISTS "Admins can view overtime conversions in their company" ON public.employee_overtime_conversions;

CREATE POLICY "Admins can view all overtime conversions" 
ON public.employee_overtime_conversions 
FOR SELECT 
USING (is_admin());