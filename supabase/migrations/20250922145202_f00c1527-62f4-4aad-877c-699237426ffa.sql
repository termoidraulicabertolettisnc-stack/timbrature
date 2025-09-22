-- Create timesheet_sessions table for multiple daily sessions
CREATE TABLE public.timesheet_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL,
  session_order INTEGER NOT NULL DEFAULT 1,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  session_type TEXT NOT NULL DEFAULT 'work', -- 'work', 'lunch_break', 'other_break'
  start_location_lat NUMERIC,
  start_location_lng NUMERIC,
  end_location_lat NUMERIC,
  end_location_lng NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_timesheet_session_order UNIQUE (timesheet_id, session_order)
);

-- Enable RLS
ALTER TABLE public.timesheet_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies matching timesheets table
CREATE POLICY "timesheet_sessions_full_access" 
ON public.timesheet_sessions 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.timesheets t 
    WHERE t.id = timesheet_sessions.timesheet_id 
    AND ((auth.uid() = t.user_id) OR is_admin())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.timesheets t 
    WHERE t.id = timesheet_sessions.timesheet_id 
    AND ((auth.uid() = t.user_id) OR is_admin())
  )
);

-- Create updated_at trigger
CREATE TRIGGER update_timesheet_sessions_updated_at
  BEFORE UPDATE ON public.timesheet_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_timesheet_sessions_timesheet_id ON public.timesheet_sessions(timesheet_id);
CREATE INDEX idx_timesheet_sessions_session_order ON public.timesheet_sessions(timesheet_id, session_order);

-- Update calculate_timesheet_hours function to work with sessions
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours_from_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    total_work_minutes numeric := 0;
    session_rec record;
    work_duration interval;
    calculated_overtime_hours numeric := 0;
    calculated_night_hours numeric := 0;
    standard_daily_hours_for_day integer := 8;
    weekly_hours_config jsonb;
    day_name text;
    is_saturday boolean;
    employee_settings_rec record;
    company_settings_rec record;
    saturday_handling_type text;
    local_start_time timestamp without time zone;
    local_end_time timestamp without time zone;
    night_start_time time := '22:00:00'::time;
    night_end_time time := '05:00:00'::time;
    night_overlap_minutes numeric := 0;
    night_start_today timestamp without time zone;
    night_end_today timestamp without time zone;
    temp_start timestamp without time zone;
    temp_end timestamp without time zone;
BEGIN
    -- Get the associated timesheet
    SELECT * INTO NEW FROM public.timesheets WHERE id = NEW.timesheet_id;
    
    IF NEW.is_absence = true THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        RETURN NEW;
    END IF;

    -- Calculate total work hours from all work sessions
    FOR session_rec IN 
        SELECT * FROM public.timesheet_sessions 
        WHERE timesheet_id = NEW.timesheet_id 
        AND session_type = 'work' 
        AND end_time IS NOT NULL
        ORDER BY session_order
    LOOP
        work_duration := session_rec.end_time - session_rec.start_time;
        total_work_minutes := total_work_minutes + (EXTRACT(EPOCH FROM work_duration) / 60);
        
        -- Calculate night hours for this session
        local_start_time := session_rec.start_time AT TIME ZONE 'Europe/Rome';
        local_end_time := session_rec.end_time AT TIME ZONE 'Europe/Rome';
        
        -- Get employee settings for night hours calculation
        IF employee_settings_rec IS NULL THEN
            SELECT es.* INTO employee_settings_rec
            FROM public.employee_settings es
            WHERE es.user_id = NEW.user_id
              AND (es.valid_from IS NULL OR es.valid_from <= NEW.date)
              AND (es.valid_to IS NULL OR es.valid_to >= NEW.date)
            ORDER BY es.valid_from DESC NULLS LAST, es.created_at DESC
            LIMIT 1;
        END IF;

        IF company_settings_rec IS NULL THEN
            SELECT cs.* INTO company_settings_rec
            FROM public.company_settings cs
            JOIN public.profiles p ON p.company_id = cs.company_id
            WHERE p.user_id = NEW.user_id
            LIMIT 1;
        END IF;

        -- Determine night shift times
        IF employee_settings_rec IS NOT NULL THEN
            night_start_time := COALESCE(employee_settings_rec.night_shift_start, '22:00:00'::time);
            night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
        ELSIF company_settings_rec IS NOT NULL THEN
            night_start_time := company_settings_rec.night_shift_start;
            night_end_time := company_settings_rec.night_shift_end;
        END IF;

        -- Calculate night hours for this session
        IF night_start_time > night_end_time THEN
            -- Night period crosses midnight
            night_start_today := DATE(local_start_time) + night_start_time;
            night_end_today := DATE(local_start_time) + night_end_time;
            
            -- Check overlap with night period before midnight
            IF local_start_time < night_end_today AND local_end_time > (DATE(local_start_time)::timestamp) THEN
                temp_start := GREATEST(local_start_time, DATE(local_start_time)::timestamp);
                temp_end := LEAST(local_end_time, night_end_today);
                IF temp_end > temp_start THEN
                    night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
                END IF;
            END IF;
            
            -- Check overlap with night period after midnight
            IF local_start_time < (DATE(local_start_time) + INTERVAL '1 day')::timestamp AND local_end_time > night_start_today THEN
                temp_start := GREATEST(local_start_time, night_start_today);
                temp_end := LEAST(local_end_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
                IF temp_end > temp_start THEN
                    night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
                END IF;
            END IF;
        ELSE
            -- Night period within same day
            night_start_today := DATE(local_start_time) + night_start_time;
            night_end_today := DATE(local_start_time) + night_end_time;
            
            IF local_start_time < night_end_today AND local_end_time > night_start_today THEN
                temp_start := GREATEST(local_start_time, night_start_today);
                temp_end := LEAST(local_end_time, night_end_today);
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
    END LOOP;

    -- Set total hours
    NEW.total_hours := ROUND(total_work_minutes / 60.0, 2);
    
    -- Calculate day info for overtime
    local_start_time := NEW.start_time AT TIME ZONE 'Europe/Rome';
    
    CASE EXTRACT(DOW FROM (local_start_time)::date)
        WHEN 1 THEN day_name := 'lun';
        WHEN 2 THEN day_name := 'mar';
        WHEN 3 THEN day_name := 'mer';
        WHEN 4 THEN day_name := 'gio';
        WHEN 5 THEN day_name := 'ven';
        WHEN 6 THEN day_name := 'sab';
        WHEN 0 THEN day_name := 'dom';
    END CASE;

    is_saturday := EXTRACT(DOW FROM (local_start_time)::date) = 6;
    NEW.is_saturday := is_saturday;

    -- Determine weekly hours configuration
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSIF company_settings_rec IS NOT NULL AND company_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb;
    END IF;

    standard_daily_hours_for_day := COALESCE((weekly_hours_config->>day_name)::integer, 8);

    -- Calculate overtime hours
    IF employee_settings_rec IS NOT NULL THEN
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
    ELSIF company_settings_rec IS NOT NULL THEN
        saturday_handling_type := company_settings_rec.saturday_handling::text;
    ELSE
        saturday_handling_type := 'straordinario';
    END IF;

    IF is_saturday THEN
        IF saturday_handling_type = 'trasferta' THEN
            calculated_overtime_hours := 0;
        ELSE
            IF standard_daily_hours_for_day = 0 THEN
                calculated_overtime_hours := NEW.total_hours;
            ELSIF NEW.total_hours > standard_daily_hours_for_day THEN
                calculated_overtime_hours := NEW.total_hours - standard_daily_hours_for_day;
            ELSE
                calculated_overtime_hours := 0;
            END IF;
        END IF;
    ELSE
        IF NEW.total_hours > standard_daily_hours_for_day THEN
            calculated_overtime_hours := NEW.total_hours - standard_daily_hours_for_day;
        ELSE
            calculated_overtime_hours := 0;
        END IF;
    END IF;
    
    NEW.overtime_hours := calculated_overtime_hours;

    -- Set night hours
    calculated_night_hours := ROUND(GREATEST(0, night_overlap_minutes) / 60.0, 2);
    NEW.night_hours := calculated_night_hours;

    -- Update the timesheet record
    UPDATE public.timesheets 
    SET 
        total_hours = NEW.total_hours,
        overtime_hours = NEW.overtime_hours,
        night_hours = NEW.night_hours,
        is_saturday = NEW.is_saturday,
        updated_at = now()
    WHERE id = NEW.timesheet_id;

    RETURN NEW;
END;
$function$;

-- Create trigger for session changes to recalculate timesheet hours
CREATE TRIGGER recalculate_timesheet_hours_on_session_change
    AFTER INSERT OR UPDATE OR DELETE ON public.timesheet_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_timesheet_hours_from_sessions();