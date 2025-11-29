-- Aggiungi policy per permettere agli admin di aggiornare i profili di tutti i dipendenti
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

CREATE POLICY "Admins can update all profiles" 
ON profiles
FOR UPDATE
USING (is_user_admin())
WITH CHECK (is_user_admin());