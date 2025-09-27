-- 🛡️ RISOLUZIONE WARNING SICUREZZA #1: Function Search Path Mutable
-- Aggiungo search_path a tutte le funzioni che ne sono sprovviste

-- Correggi is_admin function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND role = 'amministratore'::user_role
  );
END;
$function$;

-- Correggi updated_at function  
CREATE OR REPLACE FUNCTION public.updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- Correggi normalize_lunch_fields function
CREATE OR REPLACE FUNCTION public.normalize_lunch_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se è impostata una durata, azzera gli orari
  IF NEW.lunch_duration_minutes IS NOT NULL THEN
    NEW.lunch_start_time := NULL;
    NEW.lunch_end_time   := NULL;
  END IF;

  -- Se sono impostati entrambi gli orari, azzera la durata
  IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
    NEW.lunch_duration_minutes := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Correggi set_timesheet_end_date function
CREATE OR REPLACE FUNCTION public.set_timesheet_end_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Determine the correct end_date based on start_time and end_time
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        -- If end_time already has a different date than NEW.date, use that date
        IF NEW.end_time::date > NEW.date THEN
            NEW.end_date := NEW.end_time::date;
        -- If end_time has same date but time is before start_time, it means next day
        ELSIF NEW.end_time::time < NEW.start_time::time THEN
            NEW.end_date := NEW.date + INTERVAL '1 day';
        ELSE
            NEW.end_date := NEW.date;
        END IF;
    ELSE
        NEW.end_date := NEW.date;
    END IF;
    
    RETURN NEW;
END;
$function$;