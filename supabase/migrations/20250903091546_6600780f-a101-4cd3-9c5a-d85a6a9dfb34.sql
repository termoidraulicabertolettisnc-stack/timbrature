-- Add field for monthly overtime compensation tracking
ALTER TABLE public.employee_settings 
ADD COLUMN overtime_monthly_compensation boolean DEFAULT false;

COMMENT ON COLUMN public.employee_settings.overtime_monthly_compensation IS 'Indica se il dipendente ha un accordo di compensazione mensile degli straordinari';