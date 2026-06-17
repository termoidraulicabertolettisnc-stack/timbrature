import type { Tables } from '@/integrations/supabase/types';

/**
 * Row del timesheet arricchito con relazioni caricate via Supabase select.
 * Allineato ai tipi generati: estendiamo Tables<'timesheets'> con i join
 * (`profiles`, `projects`, `timesheet_sessions`) e i campi runtime opzionali
 * usati dal frontend (`location_pings`).
 */
export type TimesheetRow = Tables<'timesheets'>;
export type TimesheetSessionRow = Tables<'timesheet_sessions'>;

export interface TimesheetWithProfile extends TimesheetRow {
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  projects: {
    name: string;
  } | null;
  timesheet_sessions?: Pick<
    TimesheetSessionRow,
    'id' | 'session_order' | 'start_time' | 'end_time' | 'session_type' | 'notes'
  >[];
  // Campi runtime non presenti nello schema DB
  location_pings?: any[];
}
