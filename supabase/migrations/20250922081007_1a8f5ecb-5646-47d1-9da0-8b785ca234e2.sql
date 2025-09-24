-- Fix security warning: set search_path for the normalize_lunch_fields function
CREATE OR REPLACE FUNCTION public.normalize_lunch_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;