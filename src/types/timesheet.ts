export interface TimesheetWithProfile {
  id: string;
  date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  lunch_duration_minutes: number | null;
  notes: string | null;
  user_id: string;
  project_id: string | null;
  is_saturday: boolean;
  is_holiday: boolean;
  is_absence?: boolean;
  absence_type?: 'F' | 'M' | 'I' | 'FS' | 'PR' | 'PNR' | 'A';
  start_location_lat: number | null;
  start_location_lng: number | null;
  end_location_lat: number | null;
  end_location_lng: number | null;
  total_hours: number | null;
  overtime_hours: number | null;
  night_hours: number | null;
  meal_voucher_earned?: boolean;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
  updated_by?: string | null;
  location_pings?: any[];
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  projects: {
    name: string;
  } | null;
  timesheet_sessions?: {
    id: string;
    session_order: number;
    start_time: string;
    end_time: string | null;
    session_type: string;
    notes: string | null;
  }[];
}