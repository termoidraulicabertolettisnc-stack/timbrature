-- Create simple test function to isolate the issue
CREATE OR REPLACE FUNCTION public.test_employee_settings_lookup(p_user_id uuid, p_date date)
 RETURNS TABLE(
   found_count integer,
   lunch_type text,
   valid_from date,
   valid_to date,
   query_used text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    settings_rec record;
    count_found integer := 0;
BEGIN
    -- Test the exact query from main function
    SELECT es.* INTO settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id
      AND es.valid_from <= p_date
      AND (es.valid_to IS NULL OR es.valid_to >= p_date)
    ORDER BY es.valid_from DESC, es.created_at DESC
    LIMIT 1;
    
    IF settings_rec IS NOT NULL THEN
        count_found := 1;
    END IF;
    
    RETURN QUERY SELECT 
        count_found,
        COALESCE(settings_rec.lunch_break_type::text, 'null'),
        settings_rec.valid_from,
        settings_rec.valid_to,
        'FROM public.employee_settings es WHERE es.user_id = ' || p_user_id::text || ' AND es.valid_from <= ' || p_date::text || ' AND (es.valid_to IS NULL OR es.valid_to >= ' || p_date::text || ')';
END;
$function$;