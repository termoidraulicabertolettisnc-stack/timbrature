-- Rimuovi i campi relativi alla conversione automatica straordinari

-- Rimuovi dalle impostazioni aziendali
ALTER TABLE public.company_settings 
DROP COLUMN IF EXISTS default_overtime_conversion_limit;

-- Rimuovi dalle impostazioni dipendenti  
ALTER TABLE public.employee_settings
DROP COLUMN IF EXISTS overtime_conversion_limit;

-- Rimuovi la colonna automatic_conversion_hours dalla tabella conversioni
-- dato che ora sarà sempre 0 (solo conversioni manuali)
ALTER TABLE public.employee_overtime_conversions
DROP COLUMN IF EXISTS automatic_conversion_hours;

-- Aggiorna la colonna total_conversion_hours per essere solo manual_conversion_hours
-- (rimuoviamo la generazione automatica se esisteva)
ALTER TABLE public.employee_overtime_conversions
DROP COLUMN IF EXISTS total_conversion_hours;

-- Aggiungi nuovamente total_conversion_hours come alias di manual_conversion_hours
ALTER TABLE public.employee_overtime_conversions
ADD COLUMN total_conversion_hours NUMERIC GENERATED ALWAYS AS (manual_conversion_hours) STORED;