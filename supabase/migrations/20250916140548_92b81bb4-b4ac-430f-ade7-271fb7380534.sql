-- Add overtime conversion fields to company_settings
ALTER TABLE public.company_settings 
ADD COLUMN enable_overtime_conversion boolean DEFAULT false,
ADD COLUMN default_overtime_conversion_rate numeric DEFAULT 12.00,
ADD COLUMN default_overtime_conversion_limit integer DEFAULT NULL;

-- Add overtime conversion fields to employee_settings
ALTER TABLE public.employee_settings
ADD COLUMN enable_overtime_conversion boolean DEFAULT NULL,
ADD COLUMN overtime_conversion_rate numeric DEFAULT NULL,
ADD COLUMN overtime_conversion_limit integer DEFAULT NULL;

-- Create employee_overtime_conversions table
CREATE TABLE public.employee_overtime_conversions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  month date NOT NULL, -- First day of the month (e.g., '2024-09-01')
  automatic_conversion_hours numeric DEFAULT 0,
  manual_conversion_hours numeric DEFAULT 0,
  total_conversion_hours numeric GENERATED ALWAYS AS (COALESCE(automatic_conversion_hours, 0) + COALESCE(manual_conversion_hours, 0)) STORED,
  conversion_amount numeric DEFAULT 0,
  notes text,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Enable RLS on the new table
ALTER TABLE public.employee_overtime_conversions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for employee_overtime_conversions
CREATE POLICY "Users can view their own overtime conversions"
ON public.employee_overtime_conversions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage overtime conversions in their company"
ON public.employee_overtime_conversions
FOR ALL
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_overtime_conversions.user_id 
    AND p1.company_id = p2.company_id 
    AND p1.company_id = employee_overtime_conversions.company_id
  )
);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_employee_overtime_conversions_updated_at
  BEFORE UPDATE ON public.employee_overtime_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add audit trigger
CREATE TRIGGER employee_overtime_conversions_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_overtime_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_function();