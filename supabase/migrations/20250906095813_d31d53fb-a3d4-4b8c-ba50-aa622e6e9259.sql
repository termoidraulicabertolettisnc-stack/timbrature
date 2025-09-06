-- Add geocoded address fields to companies table
ALTER TABLE public.companies 
ADD COLUMN latitude numeric,
ADD COLUMN longitude numeric,
ADD COLUMN formatted_address text;

-- Create clients table (replacing projects concept)
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  address text NOT NULL,
  formatted_address text,
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for clients
CREATE POLICY "Users can view clients in their company"
ON public.clients
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.user_id = auth.uid() 
  AND p.company_id = clients.company_id
));

CREATE POLICY "Admins can manage clients in their company"
ON public.clients
FOR ALL
USING (is_user_admin() AND EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.user_id = auth.uid() 
  AND p.company_id = clients.company_id
));

-- Add updated_at trigger for clients
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add audit trigger for clients
CREATE TRIGGER audit_clients_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Add client_id to timesheets (keeping project_id for backwards compatibility for now)
ALTER TABLE public.timesheets 
ADD COLUMN client_id uuid;