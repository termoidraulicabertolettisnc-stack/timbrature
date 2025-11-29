-- Rimuovi policy conflittuali sulla tabella profiles
DROP POLICY IF EXISTS "admins_company_profiles_access" ON profiles;
DROP POLICY IF EXISTS "admin_can_update_all_profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Crea una nuova policy unificata per admin che possono gestire TUTTI i profili
CREATE POLICY "Admins can manage all profiles" 
ON profiles
FOR ALL
USING (is_user_admin())
WITH CHECK (is_user_admin());