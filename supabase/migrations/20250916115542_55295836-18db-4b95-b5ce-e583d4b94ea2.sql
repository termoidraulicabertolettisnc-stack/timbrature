-- Add entry tolerance fields to company_settings
ALTER TABLE public.company_settings 
ADD COLUMN standard_start_time time DEFAULT '08:00:00',
ADD COLUMN entry_tolerance_minutes integer DEFAULT 10,
ADD COLUMN enable_entry_tolerance boolean DEFAULT false;

-- Add entry tolerance fields to employee_settings  
ALTER TABLE public.employee_settings
ADD COLUMN standard_start_time time DEFAULT NULL,
ADD COLUMN entry_tolerance_minutes integer DEFAULT NULL,
ADD COLUMN enable_entry_tolerance boolean DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.company_settings.standard_start_time IS 'Orario standard di inizio lavoro per la tolleranza';
COMMENT ON COLUMN public.company_settings.entry_tolerance_minutes IS 'Minuti di tolleranza per l''ingresso dall''orario standard';
COMMENT ON COLUMN public.company_settings.enable_entry_tolerance IS 'Abilita sistema di tolleranza orario ingresso';

COMMENT ON COLUMN public.employee_settings.standard_start_time IS 'Orario standard personalizzato per il dipendente (NULL eredita da company)';
COMMENT ON COLUMN public.employee_settings.entry_tolerance_minutes IS 'Tolleranza personalizzata per il dipendente (NULL eredita da company)';
COMMENT ON COLUMN public.employee_settings.enable_entry_tolerance IS 'Abilita tolleranza per il dipendente (NULL eredita da company)';