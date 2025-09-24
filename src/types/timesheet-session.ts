export interface TimesheetSession {
  id: string;
  timesheet_id: string;
  session_order: number;
  start_time: string;
  end_time: string | null;
  session_type: 'work' | 'lunch_break' | 'other_break';
  start_location_lat: number | null;
  start_location_lng: number | null;
  end_location_lat: number | null;
  end_location_lng: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}