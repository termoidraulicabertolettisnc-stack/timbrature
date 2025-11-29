-- Modifica le policy per permettere agli admin di gestire le configurazioni di TUTTE le aziende
-- (utile per scenari multi-azienda con un unico admin)

-- Prima rimuoviamo le policy esistenti
DROP POLICY IF EXISTS "Admins can manage their company settings" ON company_settings;
DROP POLICY IF EXISTS "Users can view their company settings" ON company_settings;

-- Nuova policy: gli admin possono gestire le configurazioni di QUALSIASI azienda
CREATE POLICY "Admins can manage all company settings" 
ON company_settings
FOR ALL
USING (is_user_admin())
WITH CHECK (is_user_admin());

-- Gli utenti normali possono vedere solo le configurazioni della propria azienda
CREATE POLICY "Users can view their own company settings" 
ON company_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
    AND p.company_id = company_settings.company_id
  )
);