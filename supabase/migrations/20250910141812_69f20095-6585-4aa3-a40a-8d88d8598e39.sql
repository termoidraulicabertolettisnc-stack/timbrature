-- Add temporal versioning fields to employee_settings table
ALTER TABLE public.employee_settings 
ADD COLUMN valid_from DATE NOT NULL DEFAULT '1900-01-01',
ADD COLUMN valid_to DATE NULL;

-- Create composite index for efficient temporal queries
CREATE INDEX idx_employee_settings_temporal 
ON public.employee_settings (user_id, valid_from, valid_to);

-- Create additional index for active settings queries  
CREATE INDEX idx_employee_settings_active
ON public.employee_settings (user_id, valid_from) 
WHERE valid_to IS NULL;

-- Set all existing records to be valid from the beginning of time
UPDATE public.employee_settings 
SET valid_from = '1900-01-01'
WHERE valid_from = '1900-01-01'; -- This is a no-op but ensures the field is set

-- Add comment for documentation
COMMENT ON COLUMN public.employee_settings.valid_from IS 'Start date from which these settings are valid (inclusive)';
COMMENT ON COLUMN public.employee_settings.valid_to IS 'End date until which these settings are valid (exclusive). NULL means current/active settings';