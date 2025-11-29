-- Inserisci configurazioni di default per aziende che non le hanno
INSERT INTO company_settings (
  company_id,
  standard_weekly_hours,
  lunch_break_type,
  lunch_break_min_hours,
  saturday_handling,
  meal_voucher_policy,
  night_shift_start,
  night_shift_end,
  overtime_monthly_compensation,
  business_trip_rate_with_meal,
  business_trip_rate_without_meal,
  saturday_hourly_rate,
  meal_voucher_amount,
  daily_allowance_amount,
  daily_allowance_policy,
  daily_allowance_min_hours,
  meal_voucher_min_hours,
  enable_entry_tolerance,
  standard_start_time,
  entry_tolerance_minutes,
  enable_overtime_conversion,
  default_overtime_conversion_rate
)
SELECT 
  c.id,
  '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb,
  '60_minuti'::lunch_break_type,
  6.0,
  'trasferta'::saturday_type,
  'oltre_6_ore'::meal_voucher_type,
  '20:00:00'::time,
  '05:00:00'::time,
  false,
  30.98,
  46.48,
  10.00,
  8.00,
  10.00,
  'disabled'::meal_allowance_policy,
  6,
  6,
  false,
  '08:00:00'::time,
  10,
  false,
  12.00
FROM companies c
LEFT JOIN company_settings cs ON c.id = cs.company_id
WHERE cs.id IS NULL;

-- Crea una funzione per creare automaticamente company_settings quando viene creata una nuova azienda
CREATE OR REPLACE FUNCTION create_default_company_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO company_settings (
    company_id,
    standard_weekly_hours,
    lunch_break_type,
    lunch_break_min_hours,
    saturday_handling,
    meal_voucher_policy,
    night_shift_start,
    night_shift_end,
    overtime_monthly_compensation,
    business_trip_rate_with_meal,
    business_trip_rate_without_meal,
    saturday_hourly_rate,
    meal_voucher_amount,
    daily_allowance_amount,
    daily_allowance_policy,
    daily_allowance_min_hours,
    meal_voucher_min_hours,
    enable_entry_tolerance,
    standard_start_time,
    entry_tolerance_minutes,
    enable_overtime_conversion,
    default_overtime_conversion_rate
  ) VALUES (
    NEW.id,
    '{"lun": 8, "mar": 8, "mer": 8, "gio": 8, "ven": 8, "sab": 0, "dom": 0}'::jsonb,
    '60_minuti'::lunch_break_type,
    6.0,
    'trasferta'::saturday_type,
    'oltre_6_ore'::meal_voucher_type,
    '20:00:00'::time,
    '05:00:00'::time,
    false,
    30.98,
    46.48,
    10.00,
    8.00,
    10.00,
    'disabled'::meal_allowance_policy,
    6,
    6,
    false,
    '08:00:00'::time,
    10,
    false,
    12.00
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea il trigger per la creazione automatica
DROP TRIGGER IF EXISTS on_company_created ON companies;
CREATE TRIGGER on_company_created
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION create_default_company_settings();