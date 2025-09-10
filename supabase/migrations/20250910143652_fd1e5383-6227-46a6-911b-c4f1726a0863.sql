-- Create a password for the existing admin user for testing
-- This will allow login with thomas.bertoletti@bertolettigroup.com / test123

UPDATE auth.users 
SET 
  encrypted_password = crypt('test123', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  phone_confirmed_at = COALESCE(phone_confirmed_at, now()),
  confirmed_at = COALESCE(confirmed_at, now())
WHERE email = 'thomas.bertoletti@bertolettigroup.com';