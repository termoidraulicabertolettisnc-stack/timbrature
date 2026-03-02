
ALTER TABLE public.employee_settings 
ADD COLUMN has_meal_allowance_in_paycheck boolean DEFAULT false;

COMMENT ON COLUMN public.employee_settings.has_meal_allowance_in_paycheck IS 'Se true, il dipendente ha indennità di mensa in busta paga e usa il massimale trasferta ridotto (con pasto)';
