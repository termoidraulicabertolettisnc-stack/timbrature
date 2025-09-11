-- Rimuovi il vincolo di unicità che impedisce la gestione temporale
-- Il vincolo attuale impedisce di avere più record per user_id + company_id
-- ma per la gestione temporale abbiamo bisogno di record multipli con valid_from/valid_to diversi

ALTER TABLE public.employee_settings 
DROP CONSTRAINT IF EXISTS employee_settings_user_id_company_id_key;

-- Aggiungi un vincolo più sofisticato che permette record temporali ma evita sovrapposizioni attive
-- Solo un record per utente+company può essere attivo (valid_to = NULL) contemporaneamente
CREATE UNIQUE INDEX employee_settings_user_company_active 
ON public.employee_settings (user_id, company_id) 
WHERE valid_to IS NULL;

-- Questo permette:
-- 1. Più record storici per lo stesso user+company (con valid_to non NULL)
-- 2. Un solo record attivo per volta (con valid_to = NULL)
-- 3. Gestione corretta dei periodi temporali