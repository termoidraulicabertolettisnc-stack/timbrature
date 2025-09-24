-- Fix remaining search_path issue for sync_employee_settings_structure function
CREATE OR REPLACE FUNCTION public.sync_employee_settings_structure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    company_rec record;
    employee_rec record;
    company_columns text[];
    employee_columns text[];
    missing_column text;
BEGIN
    -- Se è un UPDATE di company_settings, sincronizza tutti i dipendenti di questa azienda
    IF TG_OP = 'UPDATE' THEN
        -- Ottieni le colonne di company_settings (escludi le colonne di sistema)
        SELECT ARRAY(
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'company_settings' 
            AND column_name NOT IN ('id', 'company_id', 'created_at', 'updated_at')
        ) INTO company_columns;
        
        -- Ottieni le colonne di employee_settings (escludi le colonne di sistema)
        SELECT ARRAY(
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'employee_settings' 
            AND column_name NOT IN ('id', 'user_id', 'company_id', 'created_by', 'updated_by', 'created_at', 'updated_at', 'valid_from', 'valid_to')
        ) INTO employee_columns;
        
        -- Per ogni dipendente dell'azienda, verifica se ha tutti i campi necessari
        FOR employee_rec IN 
            SELECT DISTINCT user_id, company_id
            FROM employee_settings 
            WHERE company_id = NEW.company_id
        LOOP
            -- Chiama la funzione di sincronizzazione a livello applicativo
            -- (questo sarà gestito meglio a livello applicativo)
            NULL;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$function$;