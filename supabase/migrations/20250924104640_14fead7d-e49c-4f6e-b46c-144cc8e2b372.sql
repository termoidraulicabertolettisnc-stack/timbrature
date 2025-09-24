-- Aggiorna i codici fiscali mancanti per i dipendenti
UPDATE public.profiles 
SET codice_fiscale = 'CBLLNZ92B18D150O'
WHERE first_name = 'Lorenzo' AND last_name = 'Cibolini';

UPDATE public.profiles 
SET codice_fiscale = 'CHRGLG60L25C678J' 
WHERE first_name = 'Luigi' AND last_name = 'Cherubelli';

-- Verifica che gli aggiornamenti siano andati a buon fine
SELECT first_name, last_name, codice_fiscale 
FROM public.profiles 
WHERE first_name IN ('Lorenzo', 'Luigi');