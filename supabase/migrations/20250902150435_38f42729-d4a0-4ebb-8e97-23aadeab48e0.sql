-- Insert initial company data for testing
INSERT INTO public.companies (id, name, city, address) VALUES 
('00000000-0000-0000-0000-000000000001'::uuid, 'Azienda Demo', 'Cremona', 'Via Roma 1');

-- Insert company settings for the demo company
INSERT INTO public.company_settings (company_id) VALUES 
('00000000-0000-0000-0000-000000000001'::uuid);

-- Insert some demo projects
INSERT INTO public.projects (company_id, name, description) VALUES 
('00000000-0000-0000-0000-000000000001'::uuid, 'Commessa Generale', 'Attività generali aziendali'),
('00000000-0000-0000-0000-000000000001'::uuid, 'Manutenzione', 'Lavori di manutenzione'),
('00000000-0000-0000-0000-000000000001'::uuid, 'Cantiere A', 'Progetto cantiere A');

-- Update the handle_new_user function to assign users to the demo company
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name, company_id)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'Nome'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Cognome'),
    '00000000-0000-0000-0000-000000000001'::uuid
  );
  RETURN NEW;
END;
$$;