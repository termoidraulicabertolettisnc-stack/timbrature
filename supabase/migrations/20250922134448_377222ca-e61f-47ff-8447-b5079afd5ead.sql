-- Test per trovare perché la funzione calculate_timesheet_hours non trova le employee_settings
-- Creo una funzione di test che simula esattamente quello che fa calculate_timesheet_hours

CREATE OR REPLACE FUNCTION public.test_employee_settings_lookup_detailed(p_user_id uuid, p_date date)
RETURNS TABLE(
    step text,
    result_text text,
    found_id uuid,
    lunch_break_type text,
    lunch_break_min_hours numeric,
    valid_from date,
    valid_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    employee_settings_rec record;
    debug_count integer;
BEGIN
    -- Step 1: Count total employee settings for this user
    SELECT COUNT(*) INTO debug_count
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id;
    
    RETURN QUERY SELECT 
        'step1'::text,
        ('Total employee_settings for user: ' || debug_count::text)::text,
        NULL::uuid,
        NULL::text,
        NULL::numeric,
        NULL::date,
        NULL::date;
    
    -- Step 2: Count with date filter
    SELECT COUNT(*) INTO debug_count
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id
      AND (es.valid_from IS NULL OR es.valid_from <= p_date);
    
    RETURN QUERY SELECT 
        'step2'::text,
        ('With valid_from filter: ' || debug_count::text)::text,
        NULL::uuid,
        NULL::text,
        NULL::numeric,
        NULL::date,
        NULL::date;
    
    -- Step 3: Count with both date filters
    SELECT COUNT(*) INTO debug_count
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id
      AND (es.valid_from IS NULL OR es.valid_from <= p_date)
      AND (es.valid_to IS NULL OR es.valid_to >= p_date);
    
    RETURN QUERY SELECT 
        'step3'::text,
        ('With both date filters: ' || debug_count::text)::text,
        NULL::uuid,
        NULL::text,
        NULL::numeric,
        NULL::date,
        NULL::date;

    -- Step 4: Try the actual query from calculate_timesheet_hours
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id
      AND (es.valid_from IS NULL OR es.valid_from <= p_date)
      AND (es.valid_to IS NULL OR es.valid_to >= p_date)
    ORDER BY es.valid_from DESC NULLS LAST, es.created_at DESC
    LIMIT 1;
    
    RETURN QUERY SELECT 
        'step4'::text,
        ('Final query result: ' || CASE WHEN employee_settings_rec.id IS NOT NULL THEN 'FOUND' ELSE 'NOT FOUND' END)::text,
        employee_settings_rec.id,
        employee_settings_rec.lunch_break_type::text,
        employee_settings_rec.lunch_break_min_hours,
        employee_settings_rec.valid_from,
        employee_settings_rec.valid_to;
END;
$function$;