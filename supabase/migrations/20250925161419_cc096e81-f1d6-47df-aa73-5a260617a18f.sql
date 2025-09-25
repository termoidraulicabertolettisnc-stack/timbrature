-- Forza l'attivazione del trigger modificando un campo specifico e poi riportandolo al valore originale
-- Questo dovrebbe attivare il trigger BEFORE UPDATE sui timesheets

-- Prima salva il valore originale e poi lo modifica per attivare il trigger
UPDATE public.timesheets 
SET lunch_duration_minutes = COALESCE(lunch_duration_minutes, 0) + 1
WHERE date = '2025-09-02' 
  AND user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Thomas' AND last_name = 'Bertoletti');

-- Poi riporta al valore originale
UPDATE public.timesheets 
SET lunch_duration_minutes = COALESCE(lunch_duration_minutes, 1) - 1
WHERE date = '2025-09-02' 
  AND user_id IN (SELECT user_id FROM profiles WHERE first_name = 'Thomas' AND last_name = 'Bertoletti');