-- Optimize database functions for better performance
-- Remove redundant debug functions and optimize core functions

-- 1. Remove debug functions that are no longer needed
DROP FUNCTION IF EXISTS public.debug_night_hours_calculation(timestamp with time zone, timestamp with time zone, time without time zone, time without time zone);
DROP FUNCTION IF EXISTS public.debug_lunch_break_calculation(uuid, date);
DROP FUNCTION IF EXISTS public.test_employee_settings_lookup_detailed(uuid, date);

-- 2. Optimize get_current_user_context function for better caching
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

-- 3. Create optimized function for common admin checks
CREATE OR REPLACE FUNCTION public.is_user_admin_in_company(target_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_context record;
BEGIN
    SELECT user_role, company_id INTO user_context
    FROM public.get_current_user_context();
    
    IF user_context.user_role != 'amministratore'::user_role THEN
        RETURN FALSE;
    END IF;
    
    -- If no specific company check needed, just return true for admin
    IF target_company_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check if admin belongs to target company
    RETURN user_context.company_id = target_company_id;
END;
$$;