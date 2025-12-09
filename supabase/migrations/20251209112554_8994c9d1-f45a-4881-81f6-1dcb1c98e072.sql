-- Add address columns to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS formatted_address text,
ADD COLUMN IF NOT EXISTS latitude numeric,
ADD COLUMN IF NOT EXISTS longitude numeric,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'ITALIA';

-- Add column to company_holidays for location-based holidays
-- patron_saint indicates if this is a location-specific holiday (e.g., patron saint day)
ALTER TABLE public.company_holidays
ADD COLUMN IF NOT EXISTS is_location_based boolean DEFAULT false;

-- Create index for faster holiday lookups
CREATE INDEX IF NOT EXISTS idx_company_holidays_company_date ON public.company_holidays(company_id, date);