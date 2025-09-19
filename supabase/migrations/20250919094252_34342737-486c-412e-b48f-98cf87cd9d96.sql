BEGIN;

-- Create unique index to prevent duplicate timesheets per user per day
CREATE UNIQUE INDEX IF NOT EXISTS timesheets_user_date_uk 
ON public.timesheets(user_id, date);

-- Fix RLS policies for cross-company timesheet access by admins
DROP POLICY IF EXISTS "Admins can view all timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can update timesheets in their company" ON public.timesheets;
DROP POLICY IF EXISTS "Admins can delete timesheets in their company" ON public.timesheets;

-- Better policies that allow admins to manage timesheets in their company
CREATE POLICY "Admins can view timesheets in their company" 
ON public.timesheets FOR SELECT 
USING (
  auth.uid() = user_id OR 
  (is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = timesheets.user_id 
    AND p1.company_id = p2.company_id
  ))
);

CREATE POLICY "Admins can insert timesheets in their company" 
ON public.timesheets FOR INSERT 
WITH CHECK (
  auth.uid() = user_id OR 
  (is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = timesheets.user_id 
    AND p1.company_id = p2.company_id
  ))
);

CREATE POLICY "Admins can update timesheets in their company" 
ON public.timesheets FOR UPDATE 
USING (
  auth.uid() = user_id OR 
  (is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = timesheets.user_id 
    AND p1.company_id = p2.company_id
  ))
);

CREATE POLICY "Admins can delete timesheets in their company" 
ON public.timesheets FOR DELETE 
USING (
  auth.uid() = user_id OR 
  (is_user_admin() AND EXISTS (
    SELECT 1 FROM profiles p1, profiles p2 
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = timesheets.user_id 
    AND p1.company_id = p2.company_id
  ))
);

-- Fix profiles RLS policies for admin access
DROP POLICY IF EXISTS "Profile access policy" ON public.profiles;

CREATE POLICY "Users can view profiles in their company" 
ON public.profiles FOR SELECT 
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.company_id = profiles.company_id
  )
);

-- Rollback the incorrect migration that moved Thomas' timesheets to Lorenzo
-- First, let's identify which timesheets were truly imported vs original
-- Based on creation dates, timesheets created on 2025-09-16 were likely imported for Lorenzo
-- Let's revert all August timesheets back to Thomas first, then we'll re-import correctly

UPDATE timesheets 
SET user_id = 'c3ef0466-3bc1-4d4d-b786-07e520e27e8e'  -- Thomas
WHERE user_id = '04610512-1818-4582-bf83-d69329b13ba8'  -- Lorenzo
  AND date >= '2025-08-01' 
  AND date <= '2025-08-31'
  AND created_at < '2025-09-16'::date;  -- Keep only the imported ones for Lorenzo

COMMIT;