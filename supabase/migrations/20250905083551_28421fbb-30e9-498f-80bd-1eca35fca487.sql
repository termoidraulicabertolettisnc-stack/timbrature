-- Add DELETE policies for timesheets table

-- Users can delete their own timesheets
CREATE POLICY "Users can delete their own timesheets" 
ON public.timesheets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins can delete timesheets in their company
CREATE POLICY "Admins can delete timesheets in their company" 
ON public.timesheets 
FOR DELETE 
USING (
  is_user_admin() AND EXISTS (
    SELECT 1 
    FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = timesheets.user_id 
    AND p1.company_id = p2.company_id
  )
);