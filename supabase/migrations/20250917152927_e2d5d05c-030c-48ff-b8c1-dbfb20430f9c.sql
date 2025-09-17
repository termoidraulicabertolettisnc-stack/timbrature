-- Fix total_conversion_hours column to be properly calculated
-- First, let's make sure it's a generated column that automatically calculates the sum

-- Drop the existing column if it exists
ALTER TABLE employee_overtime_conversions DROP COLUMN IF EXISTS total_conversion_hours;

-- Add it back as a generated column that automatically calculates automatic + manual hours
ALTER TABLE employee_overtime_conversions 
ADD COLUMN total_conversion_hours numeric 
GENERATED ALWAYS AS (COALESCE(automatic_conversion_hours, 0) + COALESCE(manual_conversion_hours, 0)) STORED;