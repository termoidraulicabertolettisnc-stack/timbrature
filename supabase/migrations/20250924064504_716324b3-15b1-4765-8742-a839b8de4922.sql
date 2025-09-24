-- CRITICAL FIX: Completely remove recursion by eliminating all profile queries from RLS policies
-- The problem is that even the new policy queries profiles table within itself, causing recursion

-- Drop ALL existing policies on profiles
DROP POLICY IF EXISTS "admins_company_profiles_access" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile_access" ON public.profiles;

-- Create a completely safe function that doesn't cause any recursion
-- This function will get the current user's company and role in one safe call
CREATE OR REPLACE FUNCTION public.get_current_user_context()
RETURNS TABLE(user_role user_role, company_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT p.role, p.company_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
END;
$$;

-- Create completely safe RLS policies that don't query profiles table
-- Policy 1: Users can access their own profile
CREATE POLICY "users_own_profile_access" 
ON public.profiles 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 2: Admins can access profiles within their company 
-- This uses a simpler approach that doesn't cause recursion
CREATE POLICY "admins_company_profiles_access" 
ON public.profiles 
FOR ALL 
USING (
    -- Only check if user is admin, don't cross-reference with profiles table
    EXISTS (
        SELECT 1 
        FROM public.get_current_user_context() ctx
        WHERE ctx.user_role = 'amministratore'::user_role
        AND ctx.company_id = profiles.company_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 
        FROM public.get_current_user_context() ctx
        WHERE ctx.user_role = 'amministratore'::user_role
        AND ctx.company_id = profiles.company_id
    )
);