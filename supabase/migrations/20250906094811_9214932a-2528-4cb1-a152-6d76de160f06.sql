-- Fix the DELETE policy for companies - admins should be able to delete any company
DROP POLICY "Admins can delete companies" ON public.companies;

CREATE POLICY "Admins can delete companies" 
ON public.companies 
FOR DELETE 
USING (is_user_admin());