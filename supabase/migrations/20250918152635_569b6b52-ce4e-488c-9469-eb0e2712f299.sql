-- Remove the trigger that automatically creates profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Remove the function that handles new user creation
DROP FUNCTION IF EXISTS public.handle_new_user();