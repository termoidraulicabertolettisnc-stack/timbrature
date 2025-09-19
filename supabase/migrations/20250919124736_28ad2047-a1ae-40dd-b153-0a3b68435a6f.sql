-- Crea una funzione di test per debuggare il calcolo delle ore notturne
CREATE OR REPLACE FUNCTION debug_night_hours_calculation(
    p_start_time timestamp with time zone,
    p_end_time timestamp with time zone,
    p_night_start time DEFAULT '22:00:00',
    p_night_end time DEFAULT '05:00:00'
)
RETURNS TABLE (
    utc_start text,
    utc_end text,
    local_start text,
    local_end text,
    night_start_today text,
    night_end_today text,
    night_overlap_minutes numeric,
    calculated_hours numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
    local_start_time timestamp without time zone;
    local_end_time timestamp without time zone;
    night_start_today timestamp without time zone;
    night_end_today timestamp without time zone;
    night_overlap_minutes numeric := 0;
    temp_start timestamp without time zone;
    temp_end timestamp without time zone;
BEGIN
    -- Converti i timestamp UTC in orario locale
    local_start_time := (p_start_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome';
    local_end_time := (p_end_time AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome';
    
    -- Calcola i periodi notturni
    IF p_night_start > p_night_end THEN
        -- Periodo che attraversa mezzanotte (es. 22:00-05:00)
        night_start_today := DATE(local_start_time) + p_night_start;
        night_end_today := DATE(local_start_time) + p_night_end;
        
        -- Calcola sovrapposizione con la parte notturna del giorno precedente (prima delle 05:00)
        IF local_start_time < night_end_today AND local_end_time > (DATE(local_start_time)::timestamp) THEN
            temp_start := GREATEST(local_start_time, DATE(local_start_time)::timestamp);
            temp_end := LEAST(local_end_time, night_end_today);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
        
        -- Calcola sovrapposizione con la parte notturna del giorno corrente (dopo le 22:00)
        IF local_start_time < (DATE(local_start_time) + INTERVAL '1 day')::timestamp AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, (DATE(local_start_time) + INTERVAL '1 day')::timestamp);
            IF temp_end > temp_start THEN
                night_overlap_minutes := night_overlap_minutes + EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
            END IF;
        END IF;
    ELSE
        -- Periodo nello stesso giorno
        night_start_today := DATE(local_start_time) + p_night_start;
        night_end_today := DATE(local_start_time) + p_night_end;
        
        IF local_start_time < night_end_today AND local_end_time > night_start_today THEN
            temp_start := GREATEST(local_start_time, night_start_today);
            temp_end := LEAST(local_end_time, night_end_today);
            night_overlap_minutes := EXTRACT(EPOCH FROM (temp_end - temp_start)) / 60;
        END IF;
    END IF;
    
    RETURN QUERY SELECT 
        p_start_time::text,
        p_end_time::text,
        local_start_time::text,
        local_end_time::text,
        night_start_today::text,
        night_end_today::text,
        night_overlap_minutes,
        ROUND(GREATEST(0, night_overlap_minutes) / 60.0, 2);
END;
$$;