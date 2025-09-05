-- Aggiunge campi per la gestione degli importi delle trasferte
-- con e senza buono pasto nelle impostazioni aziendali
ALTER TABLE public.company_settings 
ADD COLUMN business_trip_rate_with_meal NUMERIC(8,2) DEFAULT 46.48,
ADD COLUMN business_trip_rate_without_meal NUMERIC(8,2) DEFAULT 30.98;

-- Aggiunge gli stessi campi nelle impostazioni del dipendente specifico
-- (nullable perché il dipendente può usare i default aziendali)
ALTER TABLE public.employee_settings 
ADD COLUMN business_trip_rate_with_meal NUMERIC(8,2) DEFAULT NULL,
ADD COLUMN business_trip_rate_without_meal NUMERIC(8,2) DEFAULT NULL;

-- Commenti per documentare i campi
COMMENT ON COLUMN public.company_settings.business_trip_rate_with_meal IS 'Importo giornaliero trasferta quando il dipendente ha diritto al buono pasto (€)';
COMMENT ON COLUMN public.company_settings.business_trip_rate_without_meal IS 'Importo giornaliero trasferta quando il dipendente non ha diritto al buono pasto (€)';
COMMENT ON COLUMN public.employee_settings.business_trip_rate_with_meal IS 'Override dipendente per importo trasferta con buono pasto (€)';
COMMENT ON COLUMN public.employee_settings.business_trip_rate_without_meal IS 'Override dipendente per importo trasferta senza buono pasto (€)';