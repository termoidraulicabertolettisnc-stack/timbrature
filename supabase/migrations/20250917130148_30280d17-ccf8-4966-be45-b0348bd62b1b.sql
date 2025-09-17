-- Tabella per tracciare le conversioni dei buoni pasto in indennità giornaliere
CREATE TABLE public.employee_meal_voucher_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  date DATE NOT NULL,
  converted_to_allowance BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID NOT NULL,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Un solo stato per dipendente per giorno
  UNIQUE(user_id, date)
);

-- Abilitare RLS
ALTER TABLE public.employee_meal_voucher_conversions ENABLE ROW LEVEL SECURITY;

-- Policy: Gli utenti possono vedere le proprie conversioni
CREATE POLICY "Users can view their own meal voucher conversions" 
ON public.employee_meal_voucher_conversions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Gli admin possono gestire tutte le conversioni della loro azienda
CREATE POLICY "Admins can manage meal voucher conversions in their company" 
ON public.employee_meal_voucher_conversions 
FOR ALL 
USING (
  is_user_admin() AND 
  EXISTS (
    SELECT 1 FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = employee_meal_voucher_conversions.user_id
    AND p1.company_id = p2.company_id
    AND p1.company_id = employee_meal_voucher_conversions.company_id
  )
);

-- Trigger per aggiornare updated_at
CREATE TRIGGER update_meal_voucher_conversions_updated_at
  BEFORE UPDATE ON public.employee_meal_voucher_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger per audit
CREATE TRIGGER audit_meal_voucher_conversions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_meal_voucher_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_function();