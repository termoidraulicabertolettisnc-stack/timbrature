-- Rimuovi i campi relativi alla conversione automatica straordinari

-- Prima rimuovi la colonna generata total_conversion_hours
ALTER TABLE public.employee_overtime_conversions
DROP COLUMN IF EXISTS total_conversion_hours CASCADE;

-- Poi rimuovi automatic_conversion_hours
ALTER TABLE public.employee_overtime_conversions
DROP COLUMN IF EXISTS automatic_conversion_hours CASCADE;

-- Rimuovi dalle impostazioni aziendali
ALTER TABLE public.company_settings 
DROP COLUMN IF EXISTS default_overtime_conversion_limit CASCADE;

-- Rimuovi dalle impostazioni dipendenti  
ALTER TABLE public.employee_settings
DROP COLUMN IF EXISTS overtime_conversion_limit CASCADE;

-- Aggiungi nuovamente total_conversion_hours come alias di manual_conversion_hours
ALTER TABLE public.employee_overtime_conversions
ADD COLUMN total_conversion_hours NUMERIC GENERATED ALWAYS AS (manual_conversion_hours) STORED;