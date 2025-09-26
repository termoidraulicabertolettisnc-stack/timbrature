-- Forza il ricalcolo dei timesheet di Thomas per settembre 2025
-- Questo attiverà i trigger corretti per ricalcolare le ore
UPDATE timesheets 
SET updated_at = NOW()
WHERE user_id = (
    SELECT user_id 
    FROM profiles 
    WHERE email = 'thomas.bertoletti@bertolettigroup.com'
)
AND date BETWEEN '2025-09-01' AND '2025-09-30';