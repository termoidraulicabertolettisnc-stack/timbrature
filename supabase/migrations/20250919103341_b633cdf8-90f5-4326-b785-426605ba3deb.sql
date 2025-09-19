-- Correzione timezone: sottrarre 2 ore dai timestamp di Lorenzo
-- I dati Excel erano già in orario locale italiano (GMT+2)
-- ma sono stati salvati come UTC senza conversione

BEGIN;

-- Aggiornare tutti i timesheets di Lorenzo sottraendo 2 ore
UPDATE timesheets 
SET 
  start_time = start_time - INTERVAL '2 hours',
  end_time = end_time - INTERVAL '2 hours',
  lunch_start_time = CASE 
    WHEN lunch_start_time IS NOT NULL THEN lunch_start_time - INTERVAL '2 hours'
    ELSE NULL 
  END,
  lunch_end_time = CASE 
    WHEN lunch_end_time IS NOT NULL THEN lunch_end_time - INTERVAL '2 hours'
    ELSE NULL 
  END,
  updated_at = now(),
  updated_by = '04610512-1818-4582-bf83-d69329b13ba8'
WHERE user_id = '04610512-1818-4582-bf83-d69329b13ba8' 
  AND date BETWEEN '2025-08-01' AND '2025-08-31';

COMMIT;