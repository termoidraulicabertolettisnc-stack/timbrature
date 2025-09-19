-- Fix timesheets assigned to wrong user (Thomas instead of Lorenzo)
UPDATE timesheets 
SET user_id = '04610512-1818-4582-bf83-d69329b13ba8'
WHERE user_id = 'c3ef0466-3bc1-4d4d-b786-07e520e27e8e' 
  AND date >= '2025-08-01' 
  AND date <= '2025-08-31';