-- Create employee settings table for individual employee configurations
CREATE TABLE public.employee_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  standard_daily_hours INTEGER DEFAULT NULL,
  lunch_break_type lunch_break_type DEFAULT NULL,
  overtime_calculation overtime_type DEFAULT NULL,
  saturday_handling saturday_type DEFAULT NULL,
  meal_voucher_policy meal_voucher_type DEFAULT NULL,
  night_shift_start TIME DEFAULT NULL,
  night_shift_end TIME DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_by UUID DEFAULT NULL,
  
  -- Ensure one settings record per employee
  UNIQUE(user_id, company_id)
);

-- Enable RLS
ALTER TABLE public.employee_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for employee settings
CREATE POLICY "Admins can manage employee settings in their company" 
ON public.employee_settings 
FOR ALL 
USING (
  is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_settings.user_id
    AND p1.company_id = p2.company_id
    AND p1.company_id = employee_settings.company_id
  )
);

CREATE POLICY "Users can view their own employee settings" 
ON public.employee_settings 
FOR SELECT 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_employee_settings_updated_at
  BEFORE UPDATE ON public.employee_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add audit trigger
CREATE TRIGGER audit_employee_settings_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_function();