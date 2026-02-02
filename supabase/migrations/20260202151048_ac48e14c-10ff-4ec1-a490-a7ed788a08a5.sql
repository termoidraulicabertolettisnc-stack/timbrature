-- Aggiungi il valore 'AI' (Assenza Ingiustificata) all'enum absence_type
ALTER TYPE absence_type ADD VALUE IF NOT EXISTS 'AI';