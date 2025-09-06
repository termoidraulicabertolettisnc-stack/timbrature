-- Drop the existing policy and create a new one with the correct logic
DROP POLICY "Users can view their company" ON public.companies;

CREATE POLICY "Users can view their company" 
ON public.companies 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.user_id = auth.uid() 
      AND (p.role = 'amministratore'::user_role OR p.company_id = companies.id)
  )
);