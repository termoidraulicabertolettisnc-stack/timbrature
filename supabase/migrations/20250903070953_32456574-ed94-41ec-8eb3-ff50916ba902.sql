-- Update Thomas Bertoletti to administrator role
UPDATE public.profiles 
SET role = 'amministratore'::user_role
WHERE email = 'thomas.bertoletti@bertolettigroup.com';