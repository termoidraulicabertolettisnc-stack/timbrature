-- Remove the unique constraint that prevents multiple timesheet sessions per day
ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS unique_user_date;