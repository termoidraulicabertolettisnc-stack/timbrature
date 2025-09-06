-- Create location_pings table for tracking employee locations during active clock-ins
CREATE TABLE public.location_pings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timesheet_id UUID NOT NULL,
  user_id UUID NOT NULL,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  accuracy NUMERIC,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  movement_detected BOOLEAN NOT NULL DEFAULT false,
  ping_interval_used INTEGER NOT NULL DEFAULT 15, -- in minutes
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE public.location_pings 
ADD CONSTRAINT fk_location_pings_timesheet 
FOREIGN KEY (timesheet_id) REFERENCES public.timesheets(id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX idx_location_pings_timesheet_id ON public.location_pings(timesheet_id);
CREATE INDEX idx_location_pings_user_id ON public.location_pings(user_id);
CREATE INDEX idx_location_pings_timestamp ON public.location_pings(timestamp);

-- Enable RLS
ALTER TABLE public.location_pings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own location pings" 
ON public.location_pings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own location pings" 
ON public.location_pings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all location pings in their company" 
ON public.location_pings 
FOR SELECT 
USING (
  is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = location_pings.user_id 
    AND p1.company_id = p2.company_id
  )
);

-- Add audit trigger
DROP TRIGGER IF EXISTS audit_location_pings ON public.location_pings;
CREATE TRIGGER audit_location_pings
  AFTER INSERT OR UPDATE OR DELETE ON public.location_pings
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();