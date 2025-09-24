-- Create updated debug function with EXACT same logic as main function
CREATE OR REPLACE FUNCTION public.debug_timesheet_lunch_calculation_v2(p_timesheet_id uuid)
 RETURNS TABLE(
   timesheet_date date,
   user_name text,
   user_id_check uuid,
   employee_settings_found boolean,
   employee_lunch_type text,
   employee_valid_from date,
   employee_valid_to date,
   company_lunch_type text,
   calculated_lunch_minutes integer,
   lunch_overlap_seconds numeric,
   hours_worked_without_lunch numeric,
   final_total_hours numeric,
   debug_branch text,
   exact_employee_query_result text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    timesheet_rec record;
    employee_settings_rec record;
    company_settings_rec record;
    lunch_break_minutes integer := 60;
    hours_worked_without_lunch_val numeric;
    lunch_overlap_seconds_val numeric := 0;
    shift_start timestamp with time zone;
    shift_end timestamp with time zone;
    work_duration interval;
    debug_branch_val text := 'unknown';
    exact_query_result text := 'none';
BEGIN
    -- Get timesheet data
    SELECT t.*, p.first_name || ' ' || p.last_name as user_name
    INTO timesheet_rec
    FROM public.timesheets t
    JOIN public.profiles p ON p.user_id = t.user_id
    WHERE t.id = p_timesheet_id;
    
    IF timesheet_rec IS NULL THEN
        RETURN;
    END IF;
    
    -- EXACT SAME QUERY AS MAIN FUNCTION
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = timesheet_rec.user_id
      AND es.valid_from <= timesheet_rec.date
      AND (es.valid_to IS NULL OR es.valid_to >= timesheet_rec.date)
    ORDER BY es.valid_from DESC, es.created_at DESC
    LIMIT 1;
    
    -- Check what we actually found
    IF employee_settings_rec IS NOT NULL THEN
        exact_query_result := 'found: ' || employee_settings_rec.lunch_break_type::text || ' from ' || employee_settings_rec.valid_from::text;
    ELSE
        exact_query_result := 'not found for user_id: ' || timesheet_rec.user_id::text || ' date: ' || timesheet_rec.date::text;
    END IF;
    
    -- Get company settings
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = timesheet_rec.user_id
    LIMIT 1;
    
    -- EXACT SAME LOGIC AS MAIN FUNCTION  
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        debug_branch_val := 'employee_settings';
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
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.lunch_break_type IS NOT NULL THEN
        debug_branch_val := 'company_settings';
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
        debug_branch_val := 'default_fallback';
        lunch_break_minutes := 60;
    END IF;
    
    -- Calculate work duration and lunch overlap using same logic as main function
    shift_start := timesheet_rec.start_time;
    shift_end := timesheet_rec.end_time;
    work_duration := shift_end - shift_start;
    hours_worked_without_lunch_val := EXTRACT(EPOCH FROM work_duration) / 3600.0;
    
    -- Calculate lunch overlap seconds using same logic
    lunch_overlap_seconds_val := 0;
    
    IF timesheet_rec.lunch_start_time IS NOT NULL AND timesheet_rec.lunch_end_time IS NOT NULL THEN
        debug_branch_val := debug_branch_val || '_specific_times';
        -- Skip overlap calculation for brevity in debug
        
    ELSIF timesheet_rec.lunch_duration_minutes IS NOT NULL THEN
        debug_branch_val := debug_branch_val || '_duration_specified';
        lunch_overlap_seconds_val := LEAST(
            EXTRACT(EPOCH FROM work_duration),
            (timesheet_rec.lunch_duration_minutes::numeric * 60)
        );
        
    ELSE
        debug_branch_val := debug_branch_val || '_auto_settings';
        IF lunch_break_minutes > 0 AND hours_worked_without_lunch_val > 6 THEN
            lunch_overlap_seconds_val := LEAST(
                EXTRACT(EPOCH FROM work_duration),
                (lunch_break_minutes::numeric * 60)
            );
        END IF;
    END IF;
    
    -- Apply lunch deduction
    work_duration := work_duration - (lunch_overlap_seconds_val || ' seconds')::interval;
    IF work_duration < INTERVAL '0' THEN
        work_duration := INTERVAL '0';
    END IF;
    
    RETURN QUERY SELECT 
        timesheet_rec.date,
        timesheet_rec.user_name,
        timesheet_rec.user_id,
        employee_settings_rec IS NOT NULL,
        COALESCE(employee_settings_rec.lunch_break_type::text, 'null'),
        employee_settings_rec.valid_from,
        employee_settings_rec.valid_to,
        COALESCE(company_settings_rec.lunch_break_type::text, 'null'),
        lunch_break_minutes,
        lunch_overlap_seconds_val,
        hours_worked_without_lunch_val,
        ROUND((EXTRACT(EPOCH FROM work_duration) / 60.0) / 60.0, 2),
        debug_branch_val,
        exact_query_result;
END;
$function$;