
-- Add manual_trip_mode to employee_settings
ALTER TABLE public.employee_settings 
ADD COLUMN IF NOT EXISTS manual_trip_mode boolean DEFAULT false;

-- Create employee_manual_trips table
CREATE TABLE IF NOT EXISTS public.employee_manual_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  month date NOT NULL,
  trip_count integer NOT NULL DEFAULT 0,
  amount_per_trip numeric NOT NULL DEFAULT 46.48,
  total_amount numeric GENERATED ALWAYS AS (trip_count * amount_per_trip) STORED,
  created_by uuid NOT NULL,
  updated_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

-- Enable RLS
ALTER TABLE public.employee_manual_trips ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage all manual trips
CREATE POLICY "Admins can manage manual trips"
ON public.employee_manual_trips
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- RLS: Users can view their own manual trips
CREATE POLICY "Users can view their own manual trips"
ON public.employee_manual_trips
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
