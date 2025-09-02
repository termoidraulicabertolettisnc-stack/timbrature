-- Create enum for user roles
CREATE TYPE public.user_role AS ENUM ('dipendente', 'amministratore');

-- Create enum for lunch break types
CREATE TYPE public.lunch_break_type AS ENUM ('30_minuti', '60_minuti', 'libera');

-- Create enum for overtime calculation
CREATE TYPE public.overtime_type AS ENUM ('dopo_8_ore', 'sempre');

-- Create enum for saturday handling
CREATE TYPE public.saturday_type AS ENUM ('trasferta', 'straordinario');

-- Create enum for meal_voucher policy
CREATE TYPE public.meal_voucher_type AS ENUM ('oltre_6_ore', 'sempre_parttime', 'conteggio_giorni');

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'dipendente',
  company_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL DEFAULT 'Cremona',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create company_settings table
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lunch_break_type lunch_break_type NOT NULL DEFAULT '60_minuti',
  overtime_calculation overtime_type NOT NULL DEFAULT 'dopo_8_ore',
  saturday_handling saturday_type NOT NULL DEFAULT 'trasferta',
  meal_voucher_policy meal_voucher_type NOT NULL DEFAULT 'oltre_6_ore',
  night_shift_start TIME NOT NULL DEFAULT '20:00',
  night_shift_end TIME NOT NULL DEFAULT '05:00',
  standard_daily_hours INTEGER NOT NULL DEFAULT 8,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Create projects table (commesse)
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create timesheets table (timbrature)
CREATE TABLE public.timesheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.projects(id),
  date DATE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  start_location_lat DECIMAL(10, 8),
  start_location_lng DECIMAL(11, 8),
  end_location_lat DECIMAL(10, 8),
  end_location_lng DECIMAL(11, 8),
  lunch_start_time TIMESTAMP WITH TIME ZONE,
  lunch_end_time TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  total_hours DECIMAL(4, 2),
  overtime_hours DECIMAL(4, 2),
  night_hours DECIMAL(4, 2),
  is_saturday BOOLEAN NOT NULL DEFAULT false,
  is_holiday BOOLEAN NOT NULL DEFAULT false,
  meal_voucher_earned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  updated_by UUID
);

-- Create audit_logs table for tracking changes
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  changed_by UUID NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add company_id foreign key to profiles after companies table exists
ALTER TABLE public.profiles 
ADD CONSTRAINT fk_profiles_company 
FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- Add user_id foreign key to timesheets referencing profiles
ALTER TABLE public.timesheets 
ADD CONSTRAINT fk_timesheets_user 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.timesheets 
ADD CONSTRAINT fk_timesheets_created_by 
FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE RESTRICT;

ALTER TABLE public.timesheets 
ADD CONSTRAINT fk_timesheets_updated_by 
FOREIGN KEY (updated_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs 
ADD CONSTRAINT fk_audit_logs_changed_by 
FOREIGN KEY (changed_by) REFERENCES public.profiles(user_id) ON DELETE RESTRICT;

-- Create unique constraint for user-date in timesheets
ALTER TABLE public.timesheets 
ADD CONSTRAINT unique_user_date UNIQUE (user_id, date);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles in their company" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore' 
    AND p.company_id = profiles.company_id
  )
);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert new profiles for their company" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore' 
    AND p.company_id = company_id
  )
);

-- Create RLS policies for companies
CREATE POLICY "Users can view their company" 
ON public.companies 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = id
  )
);

CREATE POLICY "Admins can update their company" 
ON public.companies 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore' 
    AND p.company_id = id
  )
);

-- Create RLS policies for company_settings
CREATE POLICY "Users can view their company settings" 
ON public.company_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = company_id
  )
);

CREATE POLICY "Admins can manage their company settings" 
ON public.company_settings 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore' 
    AND p.company_id = company_id
  )
);

-- Create RLS policies for projects
CREATE POLICY "Users can view projects in their company" 
ON public.projects 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = company_id
  )
);

CREATE POLICY "Admins can manage projects in their company" 
ON public.projects 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore' 
    AND p.company_id = company_id
  )
);

-- Create RLS policies for timesheets
CREATE POLICY "Users can view their own timesheets" 
ON public.timesheets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all timesheets in their company" 
ON public.timesheets 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p1 
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'amministratore'
    AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = timesheets.user_id 
      AND p2.company_id = p1.company_id
    )
  )
);

CREATE POLICY "Users can insert their own timesheets" 
ON public.timesheets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id AND auth.uid() = created_by);

CREATE POLICY "Users can update their own timesheets" 
ON public.timesheets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can update timesheets in their company" 
ON public.timesheets 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p1 
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'amministratore'
    AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = timesheets.user_id 
      AND p2.company_id = p1.company_id
    )
  )
);

-- Create RLS policies for audit_logs
CREATE POLICY "Admins can view audit logs for their company" 
ON public.audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'amministratore'
  )
);

CREATE POLICY "System can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (true);

-- Create function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at
  BEFORE UPDATE ON public.timesheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'Nome'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'Cognome')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_values, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create audit triggers for important tables
CREATE TRIGGER audit_timesheets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();