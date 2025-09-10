-- Fix RLS policies for employee_settings table to allow proper temporal versioning

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage employee settings in their company" ON public.employee_settings;
DROP POLICY IF EXISTS "Users can view their own employee settings" ON public.employee_settings;

-- Create new policies that support temporal operations
CREATE POLICY "Users can view their own employee settings" 
ON public.employee_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all employee settings in their company" 
ON public.employee_settings 
FOR SELECT 
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_settings.user_id 
    AND p1.company_id = p2.company_id
  )
);

CREATE POLICY "Admins can insert employee settings in their company" 
ON public.employee_settings 
FOR INSERT 
WITH CHECK (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_settings.user_id 
    AND p1.company_id = p2.company_id 
    AND p1.company_id = employee_settings.company_id
  )
);

CREATE POLICY "Admins can update employee settings in their company" 
ON public.employee_settings 
FOR UPDATE 
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_settings.user_id 
    AND p1.company_id = p2.company_id
  )
);

CREATE POLICY "Admins can delete employee settings in their company" 
ON public.employee_settings 
FOR DELETE 
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_settings.user_id 
    AND p1.company_id = p2.company_id
  )
);