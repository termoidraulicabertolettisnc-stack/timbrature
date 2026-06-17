export const LUNCH_BREAK_OPTIONS = [
  { value: '0_minuti', label: 'Nessuna Pausa (0 min)' },
  { value: '15_minuti', label: '15 Minuti Fissi' },
  { value: '30_minuti', label: '30 Minuti Fissi' },
  { value: '45_minuti', label: '45 Minuti Fissi' },
  { value: '60_minuti', label: '60 Minuti Fissi (1 ora)' },
  { value: '90_minuti', label: '90 Minuti Fissi (1.5 ore)' },
  { value: '120_minuti', label: '120 Minuti Fissi (2 ore)' },
  { value: 'libera', label: 'Pausa Libera (Timbrata Manualmente)' },
];

export interface EmployeeSettings {
  id?: string;
  user_id: string;
  company_id: string;
  standard_weekly_hours: any;
  lunch_break_type: string | null;
  lunch_break_min_hours: number | null;
  saturday_handling: string | null;
  meal_voucher_policy: string | null;
  night_shift_start: string | null;
  night_shift_end: string | null;
  overtime_monthly_compensation?: boolean | null;
  business_trip_rate_with_meal: number | null;
  business_trip_rate_without_meal: number | null;
  saturday_hourly_rate: number | null;
  meal_voucher_amount: number | null;
  daily_allowance_amount: number | null;
  daily_allowance_policy: string | null;
  daily_allowance_min_hours: number | null;
  enable_entry_tolerance?: boolean | null;
  standard_start_time?: string | null;
  entry_tolerance_minutes?: number | null;
  enable_overtime_conversion?: boolean | null;
  overtime_conversion_rate?: number | null;
  has_meal_allowance_in_paycheck?: boolean | null;
  staffing_agency_name?: string | null;
  manual_trip_mode?: boolean | null;
}

export interface CompanySettings {
  standard_weekly_hours: any;
  lunch_break_type: '0_minuti' | '15_minuti' | '30_minuti' | '45_minuti' | '60_minuti' | '90_minuti' | '120_minuti' | 'libera';
  lunch_break_min_hours: number;
  saturday_handling: 'normale' | 'trasferta' | 'straordinario';
  meal_voucher_policy: 'oltre_6_ore' | 'sempre_parttime' | 'conteggio_giorni' | 'disabilitato';
  night_shift_start: string;
  night_shift_end: string;
  business_trip_rate_with_meal: number;
  business_trip_rate_without_meal: number;
  saturday_hourly_rate: number;
  meal_voucher_amount: number;
  daily_allowance_amount: number;
  daily_allowance_policy: string;
  daily_allowance_min_hours: number;
  enable_entry_tolerance?: boolean;
  standard_start_time?: string;
  entry_tolerance_minutes?: number;
  enable_overtime_conversion?: boolean;
  default_overtime_conversion_rate?: number;
}

export interface EmployeeBasic {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
}

export type ApplicationType = 'from_today' | 'from_date' | 'retroactive';

export const buildEmptyEmployeeSettings = (
  user_id: string,
  company_id: string,
): EmployeeSettings => ({
  user_id,
  company_id,
  standard_weekly_hours: null,
  lunch_break_type: null,
  lunch_break_min_hours: null,
  saturday_handling: null,
  meal_voucher_policy: null,
  night_shift_start: null,
  night_shift_end: null,
  overtime_monthly_compensation: null,
  business_trip_rate_with_meal: null,
  business_trip_rate_without_meal: null,
  saturday_hourly_rate: null,
  meal_voucher_amount: null,
  daily_allowance_amount: null,
  daily_allowance_policy: null,
  daily_allowance_min_hours: null,
  enable_entry_tolerance: null,
  standard_start_time: null,
  entry_tolerance_minutes: null,
  enable_overtime_conversion: null,
  overtime_conversion_rate: null,
  has_meal_allowance_in_paycheck: null,
  staffing_agency_name: null,
  manual_trip_mode: null,
});

export const getEffectiveValue = (employeeValue: any, companyValue: any) =>
  employeeValue !== null ? employeeValue : companyValue;

export interface SectionProps {
  settings: EmployeeSettings;
  companySettings: CompanySettings | null;
  updateSetting: (key: keyof EmployeeSettings | string, value: any) => void;
}
