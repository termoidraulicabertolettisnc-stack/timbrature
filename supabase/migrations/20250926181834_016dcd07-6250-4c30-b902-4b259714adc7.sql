-- Forza un nuovo ricalcolo dopo la correzione del trigger
UPDATE timesheets 
SET updated_at = NOW()
WHERE user_id = (
    SELECT user_id 
    FROM profiles 
    WHERE email = 'thomas.bertoletti@bertolettigroup.com'
)
AND date = '2025-09-02';