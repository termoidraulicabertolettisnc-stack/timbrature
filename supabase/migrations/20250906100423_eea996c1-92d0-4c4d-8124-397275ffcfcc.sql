-- Fix admin user's missing company_id
UPDATE profiles 
SET company_id = '30b86aec-c09c-4db3-89ae-99547f3e730c'
WHERE user_id = 'c3ef0466-3bc1-4d4d-b786-07e520e27e8e' 
AND role = 'amministratore'
AND company_id IS NULL;