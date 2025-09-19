-- Forza il ricalcolo delle ore notturne toccando start_time per riattivare il trigger
UPDATE timesheets 
SET start_time = start_time
WHERE user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Mihai') 
AND date BETWEEN '2025-08-04' AND '2025-08-06';