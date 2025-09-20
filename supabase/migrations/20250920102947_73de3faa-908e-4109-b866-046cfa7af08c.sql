-- Fix security warning by adding search_path to debug function
CREATE OR REPLACE FUNCTION public.debug_lunch_break_calculation(
    p_user_id uuid,
    p_date date
)
RETURNS TABLE(
    employee_settings_found boolean,
    employee_lunch_break_type text,
    company_lunch_break_type text,
    final_lunch_minutes integer,
    employee_settings_valid_from date,
    employee_settings_valid_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    employee_settings_rec record;
    company_settings_rec record;
    lunch_break_minutes integer := 60;
BEGIN
    -- Get employee settings for the specific date
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = p_user_id
      AND es.valid_from <= p_date
      AND (es.valid_to IS NULL OR es.valid_to >= p_date)
    ORDER BY es.valid_from DESC, es.created_at DESC
    LIMIT 1;

    -- Get company settings
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = p_user_id
    LIMIT 1;

    -- Determine lunch break minutes using same logic as main function
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE employee_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
    ELSIF company_settings_rec IS NOT NULL THEN
        CASE company_settings_rec.lunch_break_type::text
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
    ELSE
        lunch_break_minutes := 60;
    END IF;

    RETURN QUERY SELECT 
        employee_settings_rec IS NOT NULL,
        employee_settings_rec.lunch_break_type::text,
        company_settings_rec.lunch_break_type::text,
        lunch_break_minutes,
        employee_settings_rec.valid_from,
        employee_settings_rec.valid_to;
END;
$function$;

-- Force recalculation of timesheets for September 2025 by triggering updates
-- This will cause the trigger to run with the new logic
UPDATE timesheets 
SET updated_at = now()
WHERE date >= '2025-09-01' 
  AND date < '2025-10-01' 
  AND user_id IN (
    SELECT user_id FROM profiles 
    WHERE first_name = 'Mihai' AND last_name = 'Burlacu'
  )
  AND is_absence = false
  AND start_time IS NOT NULL 
  AND end_time IS NOT NULL;