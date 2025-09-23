import { supabase } from '@/integrations/supabase/client';
import { TimesheetSession } from '@/types/timesheet-session';
import { ParsedTimesheet } from './ExcelImportService';

export class TimesheetImportService {
  static async importTimesheet(timesheet: ParsedTimesheet, employee: { user_id: string }) {
    // Prepare the timesheet data for insertion
    const timesheetData = {
      user_id: employee.user_id,
      date: timesheet.date,
      start_time: timesheet.start_time,
      end_time: timesheet.end_time,
      // total_hours will be calculated by the trigger from sessions
      notes: timesheet.notes || null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
      project_id: null // Default to no project
    };

    const { data: timesheetRecord, error: timesheetError } = await supabase
      .from('timesheets')
      .upsert(timesheetData, { 
        onConflict: 'user_id,date',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (timesheetError) {
      console.error('Error inserting timesheet:', timesheetError);
      throw timesheetError;
    }

    // Create sessions for each clock-in/out pair
    const sessions: Omit<TimesheetSession, 'id' | 'created_at' | 'updated_at'>[] = [];
    
    for (let i = 0; i < timesheet.clockInTimes.length; i++) {
      const clockIn = timesheet.clockInTimes[i];
      const clockOut = timesheet.clockOutTimes[i];
      
      if (clockIn && clockOut) {
        sessions.push({
          timesheet_id: timesheetRecord.id,
          session_order: i + 1,
          start_time: clockIn,
          end_time: clockOut,
          session_type: 'work',
          start_location_lat: timesheet.start_location_lat || null,
          start_location_lng: timesheet.start_location_lng || null,
          end_location_lat: timesheet.end_location_lat || null,
          end_location_lng: timesheet.end_location_lng || null,
          notes: null
        });
      }
    }

    // Insert sessions if any exist
    if (sessions.length > 0) {
      const { error: sessionsError } = await supabase
        .from('timesheet_sessions')
        .upsert(sessions, {
          onConflict: 'timesheet_id,session_order',
          ignoreDuplicates: false
        });

      if (sessionsError) {
        console.error('Error inserting sessions:', sessionsError);
        throw sessionsError;
      }
    }

    return timesheetRecord;
  }
}