-- ===============================================
-- FASE 4: FORZA RICALCOLO (SENZA MODIFICARE CONFIGURAZIONI)
-- ===============================================

-- Forza il ricalcolo di tutti i timesheet di settembre
-- IMPORTANTE: Questo usa le configurazioni esistenti, non ne crea di nuove
UPDATE timesheets 
SET updated_at = NOW()
WHERE date >= '2025-09-01' 
  AND date <= '2025-09-30'
  AND user_id = (
    SELECT user_id 
    FROM profiles 
    WHERE email = 'thomas.bertoletti@bertolettigroup.com'
  );

-- ===============================================
-- FASE 5: VERIFICA (SENZA ASSUMERE RISULTATI)
-- ===============================================

-- Mostra qual è la configurazione effettiva applicata
SELECT 
    '🔧 CONFIGURAZIONE EFFETTIVA THOMAS' as section,
    COALESCE(es.lunch_break_type::text, cs.lunch_break_type::text, 'NESSUNA') as tipo_pausa,
    COALESCE(es.lunch_break_min_hours, cs.lunch_break_min_hours, 0) as ore_minime,
    CASE COALESCE(es.lunch_break_type, cs.lunch_break_type)::text
        WHEN '0_minuti' THEN 0
        WHEN '15_minuti' THEN 15
        WHEN '30_minuti' THEN 30
        WHEN '45_minuti' THEN 45
        WHEN '60_minuti' THEN 60
        WHEN '90_minuti' THEN 90
        WHEN '120_minuti' THEN 120
        ELSE 0
    END as minuti_pausa_effettivi
FROM profiles p
LEFT JOIN employee_settings es ON p.user_id = es.user_id
LEFT JOIN company_settings cs ON p.company_id = cs.company_id
WHERE p.email = 'thomas.bertoletti@bertolettigroup.com';

-- Verifica il risultato del 02/09 SENZA ASSUMERE cosa dovrebbe essere
SELECT 
    '📊 RISULTATO 02/09 POST-CORREZIONE' as section,
    t.date,
    t.total_hours as ore_calcolate,
    t.overtime_hours as straordinari,
    EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0 as ore_grezze,
    (SELECT COUNT(*) FROM timesheet_sessions WHERE timesheet_id = t.id) as sessioni,
    'Verifica manualmente se il risultato è corretto' as nota
FROM timesheets t
JOIN profiles p ON t.user_id = p.user_id
WHERE p.email = 'thomas.bertoletti@bertolettigroup.com'
  AND t.date = '2025-09-02';