-- Change lunch_break_min_hours from integer to numeric to allow decimal values
ALTER TABLE public.company_settings 
ALTER COLUMN lunch_break_min_hours TYPE numeric;

ALTER TABLE public.employee_settings 
ALTER COLUMN lunch_break_min_hours TYPE numeric;