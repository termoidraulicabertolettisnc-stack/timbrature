-- Aggiorna la funzione calculate_timesheet_hours per correggere la logica della pausa pranzo automatica
CREATE OR REPLACE FUNCTION public.calculate_timesheet_hours()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    work_duration interval;
    lunch_duration interval;
    total_minutes numeric;
    company_settings_rec record;
    employee_settings_rec record;
    night_start_time time;
    night_end_time time;
    calculated_night_hours numeric := 0;
    calculated_overtime_hours numeric := 0;
    standard_daily_hours integer := 8;
    is_saturday boolean;
    lunch_break_minutes integer := 60; -- default 60 minutes
    saturday_handling_type text;
    saturday_rate numeric;
    effective_meal_voucher_policy text;
    hours_worked_without_lunch numeric;
BEGIN
    -- Se non c'è end_time, non calcolare nulla
    IF NEW.end_time IS NULL OR NEW.start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Ottieni le impostazioni del dipendente specifico
    SELECT es.* INTO employee_settings_rec
    FROM public.employee_settings es
    WHERE es.user_id = NEW.user_id
    LIMIT 1;

    -- Ottieni le impostazioni aziendali
    SELECT cs.* INTO company_settings_rec
    FROM public.company_settings cs
    JOIN public.profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;

    -- Determina le impostazioni da usare (employee_settings ha priorità su company_settings)
    IF employee_settings_rec IS NOT NULL AND employee_settings_rec.lunch_break_type IS NOT NULL THEN
        -- Usa le impostazioni specifiche del dipendente
        CASE employee_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        night_start_time := COALESCE(employee_settings_rec.night_shift_start, '20:00:00'::time);
        night_end_time := COALESCE(employee_settings_rec.night_shift_end, '05:00:00'::time);
        standard_daily_hours := COALESCE(employee_settings_rec.standard_daily_hours, 8);
        saturday_handling_type := COALESCE(employee_settings_rec.saturday_handling::text, 'straordinario');
        saturday_rate := employee_settings_rec.saturday_hourly_rate;
        effective_meal_voucher_policy := COALESCE(employee_settings_rec.meal_voucher_policy::text, company_settings_rec.meal_voucher_policy::text);
    ELSIF company_settings_rec IS NOT NULL THEN
        -- Usa le impostazioni aziendali
        CASE company_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN lunch_break_minutes := 0;
            WHEN '15_minuti' THEN lunch_break_minutes := 15;
            WHEN '30_minuti' THEN lunch_break_minutes := 30;
            WHEN '45_minuti' THEN lunch_break_minutes := 45;
            WHEN '60_minuti' THEN lunch_break_minutes := 60;
            WHEN '90_minuti' THEN lunch_break_minutes := 90;
            WHEN '120_minuti' THEN lunch_break_minutes := 120;
            ELSE lunch_break_minutes := 60;
        END CASE;
        
        night_start_time := company_settings_rec.night_shift_start;
        night_end_time := company_settings_rec.night_shift_end;
        standard_daily_hours := company_settings_rec.standard_daily_hours;
        saturday_handling_type := company_settings_rec.saturday_handling::text;
        saturday_rate := company_settings_rec.saturday_hourly_rate;
        effective_meal_voucher_policy := company_settings_rec.meal_voucher_policy::text;
    ELSE
        -- Valori di default
        night_start_time := '20:00:00'::time;
        night_end_time := '05:00:00'::time;
        standard_daily_hours := 8;
        lunch_break_minutes := 60;
        saturday_handling_type := 'straordinario';
        saturday_rate := 10.00;
        effective_meal_voucher_policy := 'oltre_6_ore';
    END IF;

    -- Calcola la durata totale del lavoro (senza pausa pranzo)
    work_duration := NEW.end_time - NEW.start_time;
    
    -- Calcola le ore lavorate senza considerare ancora la pausa pranzo
    hours_worked_without_lunch := EXTRACT(EPOCH FROM work_duration) / 3600.0;
    
    -- Gestione della pausa pranzo
    IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
        -- Usa gli orari specifici di pausa pranzo
        lunch_duration := NEW.lunch_end_time - NEW.lunch_start_time;
        work_duration := work_duration - lunch_duration;
    ELSIF NEW.lunch_duration_minutes IS NOT NULL THEN
        -- Usa la durata personalizzata specificata (anche se è 0)
        IF NEW.lunch_duration_minutes > 0 THEN
            work_duration := work_duration - (NEW.lunch_duration_minutes || ' minutes')::interval;
        END IF;
        -- Se lunch_duration_minutes è 0, non sottrae nulla (nessuna pausa)
    ELSE
        -- CORREZIONE: Applica la pausa pranzo automatica SOLO se ha lavorato più di 6 ore
        -- E se la configurazione prevede una pausa pranzo (lunch_break_minutes > 0)
        IF lunch_break_minutes > 0 AND hours_worked_without_lunch > 6 THEN
            work_duration := work_duration - (lunch_break_minutes || ' minutes')::interval;
        END IF;
    END IF;

    -- Converti in ore decimali
    total_minutes := EXTRACT(EPOCH FROM work_duration) / 60;
    NEW.total_hours := ROUND(total_minutes / 60.0, 2);

    -- Determina se è sabato
    is_saturday := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := is_saturday;

    -- Calcola ore straordinarie
    IF is_saturday AND saturday_handling_type = 'trasferta' THEN
        -- Sabato pagato in trasferte: non conta come straordinario
        calculated_overtime_hours := 0;
        -- Le ore del sabato saranno gestite separatamente nell'export
    ELSE
        -- Calcolo normale delle ore straordinarie (oltre le ore standard giornaliere)
        IF NEW.total_hours > standard_daily_hours THEN
            calculated_overtime_hours := NEW.total_hours - standard_daily_hours;
        END IF;
    END IF;
    NEW.overtime_hours := calculated_overtime_hours;

    -- Calcola ore notturne (approssimazione semplice - ore tra orari configurati)
    IF (NEW.start_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
       (NEW.start_time::time BETWEEN '00:00:00'::time AND night_end_time) OR
       (NEW.end_time::time BETWEEN night_start_time AND '23:59:59'::time) OR
       (NEW.end_time::time BETWEEN '00:00:00'::time AND night_end_time) THEN
        calculated_night_hours := NEW.total_hours;
    END IF;
    NEW.night_hours := calculated_night_hours;

    -- Determina se ha diritto al buono pasto in base alla politica effective
    IF effective_meal_voucher_policy = 'disabilitato' THEN
        NEW.meal_voucher_earned := false;
    ELSIF effective_meal_voucher_policy = 'oltre_6_ore' THEN
        NEW.meal_voucher_earned := NEW.total_hours > 6;
    ELSIF effective_meal_voucher_policy = 'sempre_parttime' THEN
        -- Logic for part-time employees - always earned (would need additional employee info)
        NEW.meal_voucher_earned := true;
    ELSIF effective_meal_voucher_policy = 'conteggio_giorni' THEN
        -- This policy counts days but doesn't assign vouchers directly
        NEW.meal_voucher_earned := false;
    ELSE
        -- Fallback to default behavior
        NEW.meal_voucher_earned := NEW.total_hours > 6;
    END IF;

    RETURN NEW;
END;
$function$;