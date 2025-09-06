-- Update the RLS policy to allow admins to view all companies
DROP POLICY IF EXISTS "Users can view their company" ON public.companies;

CREATE POLICY "Users can view their company or admins can view all" 
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