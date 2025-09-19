-- Add codice_fiscale field to profiles table for better employee matching during imports
ALTER TABLE public.profiles 
ADD COLUMN codice_fiscale TEXT UNIQUE;