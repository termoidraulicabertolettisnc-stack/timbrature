-- Aggiorna l'enum meal_allowance_policy per sostituire 'meal_vouchers_always' con 'both'
-- Prima rimuovo il valore vecchio e aggiungo il nuovo
ALTER TYPE meal_allowance_policy ADD VALUE 'both';

-- Aggiorna tutti i record esistenti che usano 'meal_vouchers_always' per usare 'both'
UPDATE company_settings SET meal_allowance_policy = 'both' WHERE meal_allowance_policy = 'meal_vouchers_always';
UPDATE employee_settings SET meal_allowance_policy = 'both' WHERE meal_allowance_policy = 'meal_vouchers_always';

-- Non posso rimuovere direttamente un valore dall'enum, quindi creo un nuovo enum
CREATE TYPE meal_allowance_policy_new AS ENUM ('disabled', 'meal_vouchers_only', 'daily_allowance', 'both');

-- Aggiorna le colonne per usare il nuovo enum
ALTER TABLE company_settings 
ALTER COLUMN meal_allowance_policy TYPE meal_allowance_policy_new 
USING meal_allowance_policy::text::meal_allowance_policy_new;

ALTER TABLE employee_settings 
ALTER COLUMN meal_allowance_policy TYPE meal_allowance_policy_new 
USING meal_allowance_policy::text::meal_allowance_policy_new;

-- Rimuove il vecchio enum e rinomina il nuovo
DROP TYPE meal_allowance_policy;
ALTER TYPE meal_allowance_policy_new RENAME TO meal_allowance_policy;