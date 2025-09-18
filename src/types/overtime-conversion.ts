export interface OvertimeConversion {
  id: string;
  user_id: string;
  company_id: string;
  month: string; // Format: 'YYYY-MM-01'
  manual_conversion_hours: number;
  total_conversion_hours: number;
  conversion_amount: number;
  notes?: string;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OvertimeConversionSettings {
  enable_overtime_conversion: boolean;
  overtime_conversion_rate: number;
}

export interface OvertimeConversionCalculation {
  original_overtime_hours: number;
  converted_hours: number;
  remaining_overtime_hours: number;
  conversion_amount: number;
  conversion_rate: number;
  explanation: string;
}

export interface MonthlyOvertimeData {
  user_id: string;
  month: string;
  total_overtime_hours: number;
  manual_conversion_hours: number;
  final_overtime_hours: number;
  conversion_amount: number;
}