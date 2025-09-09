-- Forza il ricalcolo del trigger per i timesheets di oggi
UPDATE timesheets 
SET start_time = start_time 
WHERE date = '2025-09-09' AND id = '2adbd35f-7c37-41b0-bc42-97d7d72068ed';