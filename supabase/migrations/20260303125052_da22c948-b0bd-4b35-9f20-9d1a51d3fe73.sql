ALTER TABLE public.employee_settings 
ADD COLUMN staffing_agency_name text DEFAULT NULL;

COMMENT ON COLUMN public.employee_settings.staffing_agency_name 
IS 'Nome dell''agenzia di somministrazione (es. Adecco, Manpower). Se valorizzato, il dipendente è in somministrazione e viene esportato separatamente.';