-- Fix security warning - set search_path for the function
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours()
RETURNS TRIGGER AS $$
DECLARE
    work_duration interval;
    lunch_duration interval;
    total_minutes numeric;
    company_settings_rec record;
    night_start_time time;
    night_end_time time;
    calculated_night_hours numeric := 0;
    calculated_overtime_hours numeric := 0;
    standard_daily_hours integer := 8;
    is_saturday boolean;
BEGIN
    -- Se non c'è end_time, non calcolare nulla
    IF NEW.end_time IS NULL OR NEW.start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Ottieni le impostazioni aziendali
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Se non ci sono impostazioni aziendali, usa i valori di default
    IF company_settings_rec IS NULL THEN
        night_start_time := '20:00:00'::time;
        night_end_time := '05:00:00'::time;
        standard_daily_hours := 8;
    ELSE
        night_start_time := company_settings_rec.night_shift_start;
        night_end_time := company_settings_rec.night_shift_end;
        standard_daily_hours := company_settings_rec.standard_daily_hours;
    END IF;

    -- Calcola la durata totale del lavoro
    work_duration := NEW.end_time - NEW.start_time;
    
    -- Sottrai la pausa pranzo se specificata
    IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
        lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
        work_duration := work_duration - lunch_duration;
    ELSE
        -- Se non specificata, sottrai 1 ora se ha lavorato più di 6 ore
        IF EXTRACT(EPOCH FROM work_duration) / 3600 > 6 THEN
            work_duration := work_duration - interval '1 hour';
        END IF;
    END IF;

    -- Converti in ore decimali
    total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
    NEW.total_hours := ROUND(total_minutes / 60.0, 2);

    -- Calcola ore straordinarie (oltre le ore standard giornaliere)
    IF NEW.total_hours > standard_daily_hours THEN
        calculated_overtime_hours := NEW.total_hours - standard_daily_hours;
    END IF;
    NEW.overtime_hours := calculated_overtime_hours;

    -- Calcola ore notturne (approssimazione semplice - ore tra 20:00 e 05:00)
    IF (NEW.start_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
       (NEW.start_time::time BETWEEN '00:00:00'::time AND night_end_time) OR
       (NEW.end_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
       (NEW.end_time::time BETWEEN '00:00:00'::time AND night_end_time) THEN
        calculated_night_hours := NEW.total_hours;
    END IF;
    NEW.night_hours := calculated_night_hours;

    -- Determina se è sabato
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    -- Determina se ha diritto al buono pasto (se ha lavorato più di 6 ore)
    NEW.meal_voucher_earned := NEW.total_hours > 6;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Aggiorna i timesheet esistenti che hanno start_time e end_time ma valori calcolati nulli
UPDATE public.timesheets 
SET 
    total_hours = CASE 
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN
            ROUND(EXTRACT(EPOCH FROM (end_time - start_time - COALESCE(lunch_end_time - lunch_start_time, 
                CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 > 6 THEN interval '1 hour' ELSE interval '0' END
            ))) / 3600.0, 2)
        ELSE total_hours
    END,
    overtime_hours = CASE 
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN
            GREATEST(0, ROUND(EXTRACT(EPOCH FROM (end_time - start_time - COALESCE(lunch_end_time - lunch_start_time, 
                CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 > 6 THEN interval '1 hour' ELSE interval '0' END
            ))) / 3600.0, 2) - 8)
        ELSE overtime_hours
    END,
    night_hours = CASE 
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL AND 
             ((start_time::time BETWEEN '20:00:00'::time AND '23:59:59'::time) OR
              (start_time::time BETWEEN '00:00:00'::time AND '05:00:00'::time) OR
              (end_time::time BETWEEN '20:00:00'::time AND '23:59:59'::time) OR
              (end_time::time BETWEEN '00:00:00'::time AND '05:00:00'::time)) THEN
            ROUND(EXTRACT(EPOCH FROM (end_time - start_time - COALESCE(lunch_end_time - lunch_start_time, 
                CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 > 6 THEN interval '1 hour' ELSE interval '0' END
            ))) / 3600.0, 2)
        ELSE 0
    END,
    is_saturday = EXTRACT(DOW FROM date) = 6,
    meal_voucher_earned = CASE 
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN
            ROUND(EXTRACT(EPOCH FROM (end_time - start_time - COALESCE(lunch_end_time - lunch_start_time, 
                CASE WHEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 > 6 THEN interval '1 hour' ELSE interval '0' END
            ))) / 3600.0, 2) > 6
        ELSE meal_voucher_earned
    END
WHERE start_time IS NOT NULL AND end_time IS NOT NULL;