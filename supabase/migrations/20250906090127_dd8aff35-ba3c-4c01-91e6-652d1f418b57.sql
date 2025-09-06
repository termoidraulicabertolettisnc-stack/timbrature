-- Aggiungere campo contract_working_days a employee_settings
ALTER TABLE public.employee_settings 
ADD COLUMN contract_working_days text CHECK (contract_working_days IN ('lun_ven', 'lun_sab'));

-- Creare enum per tipi di assenza
CREATE TYPE public.absence_type AS ENUM (
  'A',   -- Assenza Ingiustificata
  'F',   -- Ferie
  'FS',  -- Festività
  'I',   -- Infortunio
  'M',   -- Malattia
  'PR',  -- Permesso Retribuito
  'PNR'  -- Permesso non retribuito
);

-- Creare tabella per gestire assenze dipendenti
CREATE TABLE public.employee_absences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  date date NOT NULL,
  absence_type absence_type NOT NULL,
  hours numeric DEFAULT 8.0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid,
  UNIQUE(user_id, date, absence_type)
);

-- Abilitare RLS sulla tabella employee_absences
ALTER TABLE public.employee_absences ENABLE ROW LEVEL SECURITY;

-- Policy per visualizzare le proprie assenze
CREATE POLICY "Users can view their own absences" 
ON public.employee_absences 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy per admin per gestire assenze della loro azienda
CREATE POLICY "Admins can manage absences in their company" 
ON public.employee_absences 
FOR ALL 
USING (is_user_admin() AND EXISTS (
  SELECT 1 FROM profiles p1, profiles p2 
  WHERE p1.user_id = auth.uid() 
  AND p2.user_id = employee_absences.user_id 
  AND p1.company_id = p2.company_id 
  AND p1.company_id = employee_absences.company_id
));

-- Creare tabella per festività aziendali
CREATE TABLE public.company_holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  is_recurring boolean DEFAULT false, -- per festività che si ripetono ogni anno
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(company_id, date)
);

-- Abilitare RLS sulla tabella company_holidays
ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

-- Policy per visualizzare festività della propria azienda
CREATE POLICY "Users can view their company holidays" 
ON public.company_holidays 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles p 
  WHERE p.user_id = auth.uid() 
  AND p.company_id = company_holidays.company_id
));

-- Policy per admin per gestire festività della loro azienda
CREATE POLICY "Admins can manage their company holidays" 
ON public.company_holidays 
FOR ALL 
USING (is_user_admin() AND EXISTS (
  SELECT 1 FROM profiles p 
  WHERE p.user_id = auth.uid() 
  AND p.company_id = company_holidays.company_id
));

-- Aggiungere campi per gestione buoni pasto multi-taglio a company_settings
ALTER TABLE public.company_settings 
ADD COLUMN meal_voucher_denominations jsonb DEFAULT '[{"amount": 8.00, "enabled": true}]'::jsonb;

-- Creare trigger per aggiornare updated_at su employee_absences
CREATE TRIGGER update_employee_absences_updated_at
BEFORE UPDATE ON public.employee_absences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Creare trigger per aggiornare updated_at su company_holidays
CREATE TRIGGER update_company_holidays_updated_at
BEFORE UPDATE ON public.company_holidays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Creare trigger di audit per employee_absences
CREATE TRIGGER audit_employee_absences_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.employee_absences
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Creare trigger di audit per company_holidays
CREATE TRIGGER audit_company_holidays_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.company_holidays
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();