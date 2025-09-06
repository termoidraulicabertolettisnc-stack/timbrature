-- Add INSERT policy for companies table
CREATE POLICY "Admins can insert companies" 
ON public.companies 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM profiles p 
    WHERE p.user_id = auth.uid() 
      AND p.role = 'amministratore'::user_role
  )
);