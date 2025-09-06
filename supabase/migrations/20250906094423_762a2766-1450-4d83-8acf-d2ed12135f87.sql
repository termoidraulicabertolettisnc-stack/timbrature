-- Add DELETE policy for companies to allow admins to delete companies
CREATE POLICY "Admins can delete companies" 
ON public.companies 
FOR DELETE 
USING (
  is_user_admin() AND EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.user_id = auth.uid() 
      AND p.company_id = companies.id
  )
);