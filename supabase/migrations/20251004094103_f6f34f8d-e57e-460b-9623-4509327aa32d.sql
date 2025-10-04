-- Fix: Correggi il timesheet con ore notturne errate (25/09/2025)
UPDATE timesheets
SET night_hours = 0
WHERE id = 'a16025c7-c317-4143-8ddd-5e43556dd997'
  AND date = '2025-09-25'
  AND night_hours = 2.00;

-- Aggiungi il calcolo delle ore notturne nella funzione calculate_timesheet_hours_complete
CREATE OR REPLACE FUNCTION calculate_timesheet_hours_complete()
RETURNS TRIGGER AS $$
DECLARE
    -- Variabili esistenti
    company_settings_rec RECORD;
    employee_settings_rec RECORD;
    ore_lorde NUMERIC;
    pausa_da_applicare INTEGER := 0;
    ore_minime_per_pausa NUMERIC;
    ore_finali NUMERIC;
    ore_standard_giorno NUMERIC;
    ore_minime_buono_pasto NUMERIC;
    numero_sessioni INTEGER;
    ore_sessioni NUMERIC;
    giorno_settimana TEXT;
    weekly_hours_config JSONB;
    e_sabato BOOLEAN;
    saturday_handling_mode TEXT;
    saturday_rate NUMERIC;
    
    -- Nuove variabili per ore notturne
    night_start_time TIME;
    night_end_time TIME;
    calculated_night_minutes NUMERIC := 0;
    work_start_local TIMESTAMP;
    work_end_local TIMESTAMP;
BEGIN
    -- CASO 1: Se è un'assenza, azzera tutto
    IF NEW.is_absence = TRUE THEN
        NEW.total_hours := 0;
        NEW.overtime_hours := 0;
        NEW.night_hours := 0;
        NEW.meal_voucher_earned := FALSE;
        RETURN NEW;
    END IF;
    
    -- CASO 2: Se mancano gli orari, non calcolare
    IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- ============================================
    -- STEP 1: RECUPERA LE CONFIGURAZIONI
    -- ============================================
    
    SELECT * INTO employee_settings_rec
    FROM employee_settings
    WHERE user_id = NEW.user_id
      AND (valid_from IS NULL OR valid_from <= NEW.date)
      AND (valid_to IS NULL OR valid_to >= NEW.date)
    ORDER BY valid_from DESC NULLS LAST
    LIMIT 1;
    
    SELECT cs.* INTO company_settings_rec
    FROM company_settings cs
    JOIN profiles p ON p.company_id = cs.company_id
    WHERE p.user_id = NEW.user_id
    LIMIT 1;
    
    -- ============================================
    -- STEP 2: DETERMINA IL GIORNO E SE È SABATO
    -- ============================================
    
    e_sabato := EXTRACT(DOW FROM NEW.date) = 6;
    NEW.is_saturday := e_sabato;
    
    CASE EXTRACT(DOW FROM NEW.date)
        WHEN 1 THEN giorno_settimana := 'lun';
        WHEN 2 THEN giorno_settimana := 'mar';
        WHEN 3 THEN giorno_settimana := 'mer';
        WHEN 4 THEN giorno_settimana := 'gio';
        WHEN 5 THEN giorno_settimana := 'ven';
        WHEN 6 THEN giorno_settimana := 'sab';
        WHEN 0 THEN giorno_settimana := 'dom';
    END CASE;
    
    -- ============================================
    -- STEP 3: GESTIONE SPECIALE SABATO
    -- ============================================
    
    IF e_sabato THEN
        saturday_handling_mode := COALESCE(
            employee_settings_rec.saturday_handling::TEXT,
            company_settings_rec.saturday_handling::TEXT,
            'normale'
        );
        
        saturday_rate := COALESCE(
            employee_settings_rec.saturday_hourly_rate,
            company_settings_rec.saturday_hourly_rate,
            0
        );
    END IF;
    
    -- ============================================
    -- STEP 4: ORE STANDARD DEL GIORNO
    -- ============================================
    
    IF employee_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := employee_settings_rec.standard_weekly_hours;
    ELSIF company_settings_rec.standard_weekly_hours IS NOT NULL THEN
        weekly_hours_config := company_settings_rec.standard_weekly_hours;
    ELSE
        weekly_hours_config := '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::JSONB;
    END IF;
    
    ore_standard_giorno := COALESCE((weekly_hours_config->>giorno_settimana)::NUMERIC, 8);
    
    -- ============================================
    -- STEP 5: PAUSA PRANZO
    -- ============================================
    
    IF NEW.lunch_duration_minutes IS NOT NULL THEN
        pausa_da_applicare := NEW.lunch_duration_minutes;
        ore_minime_per_pausa := COALESCE(
            employee_settings_rec.lunch_break_min_hours,
            company_settings_rec.lunch_break_min_hours,
            6.0
        );
    ELSIF employee_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE employee_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN pausa_da_applicare := 0;
            WHEN '15_minuti' THEN pausa_da_applicare := 15;
            WHEN '30_minuti' THEN pausa_da_applicare := 30;
            WHEN '45_minuti' THEN pausa_da_applicare := 45;
            WHEN '60_minuti' THEN pausa_da_applicare := 60;
            WHEN '90_minuti' THEN pausa_da_applicare := 90;
            WHEN '120_minuti' THEN pausa_da_applicare := 120;
            WHEN 'libera' THEN 
                IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
                    pausa_da_applicare := EXTRACT(EPOCH FROM (NEW.lunch_end_time - NEW.lunch_start_time)) / 60;
                ELSE
                    pausa_da_applicare := 0;
                END IF;
            ELSE pausa_da_applicare := 30;
        END CASE;
        ore_minime_per_pausa := COALESCE(employee_settings_rec.lunch_break_min_hours, 6.0);
    ELSIF company_settings_rec.lunch_break_type IS NOT NULL THEN
        CASE company_settings_rec.lunch_break_type
            WHEN '0_minuti' THEN pausa_da_applicare := 0;
            WHEN '15_minuti' THEN pausa_da_applicare := 15;
            WHEN '30_minuti' THEN pausa_da_applicare := 30;
            WHEN '45_minuti' THEN pausa_da_applicare := 45;
            WHEN '60_minuti' THEN pausa_da_applicare := 60;
            WHEN '90_minuti' THEN pausa_da_applicare := 90;
            WHEN '120_minuti' THEN pausa_da_applicare := 120;
            WHEN 'libera' THEN 
                IF NEW.lunch_start_time IS NOT NULL AND NEW.lunch_end_time IS NOT NULL THEN
                    pausa_da_applicare := EXTRACT(EPOCH FROM (NEW.lunch_end_time - NEW.lunch_start_time)) / 60;
                ELSE
                    pausa_da_applicare := 0;
                END IF;
            ELSE pausa_da_applicare := 30;
        END CASE;
        ore_minime_per_pausa := COALESCE(company_settings_rec.lunch_break_min_hours, 6.0);
    ELSE
        pausa_da_applicare := 30;
        ore_minime_per_pausa := 6.0;
    END IF;
    
    -- ============================================
    -- STEP 6: CALCOLA ORE LAVORATE
    -- ============================================
    
    SELECT COUNT(*), 
           COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0), 0)
    INTO numero_sessioni, ore_sessioni
    FROM timesheet_sessions
    WHERE timesheet_id = NEW.id
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND session_type = 'work';
    
    IF numero_sessioni > 0 THEN
        ore_lorde := ore_sessioni;
    ELSE
        ore_lorde := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    END IF;
    
    IF ore_lorde > ore_minime_per_pausa AND pausa_da_applicare > 0 THEN
        ore_finali := ore_lorde - (pausa_da_applicare::NUMERIC / 60.0);
    ELSE
        ore_finali := ore_lorde;
    END IF;
    
    ore_finali := GREATEST(0, ore_finali);
    NEW.total_hours := ROUND(ore_finali, 2);
    
    -- ============================================
    -- STEP 7: CALCOLA STRAORDINARI CON SABATO
    -- ============================================
    
    IF e_sabato THEN
        CASE saturday_handling_mode
            WHEN 'normale' THEN
                NEW.overtime_hours := GREATEST(0, NEW.total_hours - ore_standard_giorno);
            WHEN 'straordinario' THEN
                NEW.overtime_hours := NEW.total_hours;
            WHEN 'trasferta' THEN
                NEW.overtime_hours := 0;
            ELSE
                NEW.overtime_hours := GREATEST(0, NEW.total_hours - ore_standard_giorno);
        END CASE;
    ELSE
        NEW.overtime_hours := GREATEST(0, NEW.total_hours - ore_standard_giorno);
    END IF;
    
    -- ============================================
    -- STEP 8: CALCOLA ORE NOTTURNE (NUOVO)
    -- ============================================
    
    -- Ottieni i range notturni dalla configurazione
    night_start_time := COALESCE(
        employee_settings_rec.night_shift_start,
        company_settings_rec.night_shift_start,
        '22:00:00'::TIME
    );
    
    night_end_time := COALESCE(
        employee_settings_rec.night_shift_end,
        company_settings_rec.night_shift_end,
        '05:00:00'::TIME
    );
    
    -- Converti gli orari UTC in timezone locale (Europe/Rome)
    work_start_local := NEW.start_time AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome';
    work_end_local := NEW.end_time AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome';
    
    -- Calcola le ore notturne confrontando con il range notturno
    -- Gestisce correttamente il caso in cui il turno attraversa la mezzanotte
    IF night_start_time > night_end_time THEN
        -- Il turno notturno attraversa la mezzanotte (es. 22:00-05:00)
        -- Parte 1: dalla start alla fine della giornata se dopo night_start
        IF EXTRACT(HOUR FROM work_start_local) * 60 + EXTRACT(MINUTE FROM work_start_local) >= 
           EXTRACT(HOUR FROM night_start_time) * 60 + EXTRACT(MINUTE FROM night_start_time) THEN
            calculated_night_minutes := calculated_night_minutes + 
                LEAST(
                    EXTRACT(EPOCH FROM (work_end_local - work_start_local)) / 60,
                    (24 * 60) - (EXTRACT(HOUR FROM work_start_local) * 60 + EXTRACT(MINUTE FROM work_start_local))
                );
        END IF;
        
        -- Parte 2: dall'inizio della giornata se prima di night_end
        IF EXTRACT(HOUR FROM work_end_local) * 60 + EXTRACT(MINUTE FROM work_end_local) <= 
           EXTRACT(HOUR FROM night_end_time) * 60 + EXTRACT(MINUTE FROM night_end_time) THEN
            calculated_night_minutes := calculated_night_minutes + 
                EXTRACT(HOUR FROM work_end_local) * 60 + EXTRACT(MINUTE FROM work_end_local);
        END IF;
    ELSE
        -- Il turno notturno è nello stesso giorno
        IF EXTRACT(HOUR FROM work_start_local) * 60 + EXTRACT(MINUTE FROM work_start_local) >= 
           EXTRACT(HOUR FROM night_start_time) * 60 + EXTRACT(MINUTE FROM night_start_time) AND
           EXTRACT(HOUR FROM work_end_local) * 60 + EXTRACT(MINUTE FROM work_end_local) <= 
           EXTRACT(HOUR FROM night_end_time) * 60 + EXTRACT(MINUTE FROM night_end_time) THEN
            calculated_night_minutes := EXTRACT(EPOCH FROM (work_end_local - work_start_local)) / 60;
        END IF;
    END IF;
    
    -- Converti i minuti in ore e arrotonda
    NEW.night_hours := ROUND(calculated_night_minutes / 60.0, 2);
    
    -- ============================================
    -- STEP 9: BUONO PASTO
    -- ============================================
    
    ore_minime_buono_pasto := COALESCE(
        employee_settings_rec.meal_voucher_min_hours,
        company_settings_rec.meal_voucher_min_hours,
        6.0
    );
    
    IF employee_settings_rec.meal_voucher_policy = 'disabilitato' OR 
       (employee_settings_rec.meal_voucher_policy IS NULL AND 
        company_settings_rec.meal_voucher_policy = 'disabilitato') THEN
        NEW.meal_voucher_earned := FALSE;
    ELSE
        NEW.meal_voucher_earned := (NEW.total_hours >= ore_minime_buono_pasto);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;