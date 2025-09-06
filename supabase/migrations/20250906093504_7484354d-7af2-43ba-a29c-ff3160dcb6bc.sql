-- Fix the RLS policy for company updates
DROP POLICY IF EXISTS "Admins can update their company" ON public.companies;

CREATE POLICY "Admins can update their company" 
ON public.companies 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.user_id = auth.uid() 
      AND p.role = 'amministratore'::user_role 
      AND p.company_id = companies.id
  )
);