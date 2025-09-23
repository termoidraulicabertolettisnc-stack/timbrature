import { supabase } from '@/integrations/supabase/client';
import { TimesheetSession } from '@/types/timesheet-session';
import { ParsedTimesheet } from './ExcelImportService';

export class TimesheetImportService {
  static async importTimesheet(timesheet: ParsedTimesheet, employee: { user_id: string }) {
    // Prepare the timesheet data for insertion
    const timesheetData = {
      user_id: employee.user_id,
      date: timesheet.date,
      // Clear individual time fields - sessions will handle timing
      start_time: null,
      end_time: null,
      lunch_start_time: null,
      lunch_end_time: null,
      lunch_duration_minutes: null,
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
    
    // Add work sessions for each clock-in/out pair
    for (let i = 0; i < timesheet.clockInTimes.length; i++) {
      const clockIn = timesheet.clockInTimes[i];
      const clockOut = timesheet.clockOutTimes[i];
      
      if (clockIn && clockOut) {
        sessions.push({
          timesheet_id: timesheetRecord.id,
          session_order: sessions.length + 1,
          start_time: clockIn,
          end_time: clockOut,
          session_type: 'work',
          start_location_lat: timesheet.start_location_lat || null,
          start_location_lng: timesheet.start_location_lng || null,
          end_location_lat: timesheet.end_location_lat || null,
          end_location_lng: timesheet.end_location_lng || null,
          notes: `Sessione lavoro ${i + 1}`
        });
      }
    }

    // If we have more than one work session, try to detect lunch breaks
    if (sessions.length > 1) {
      // Look for gaps between sessions that could be lunch breaks
      for (let i = 0; i < sessions.length - 1; i++) {
        const currentSession = sessions[i];
        const nextSession = sessions[i + 1];
        
        const gapStart = new Date(currentSession.end_time);
        const gapEnd = new Date(nextSession.start_time);
        const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);
        
        // If gap is between 15 minutes and 2 hours, consider it a lunch break
        if (gapMinutes >= 15 && gapMinutes <= 120) {
          // Insert lunch break session
          const lunchBreakSession: Omit<TimesheetSession, 'id' | 'created_at' | 'updated_at'> = {
            timesheet_id: timesheetRecord.id,
            session_order: currentSession.session_order + 0.5, // Will be reordered later
            start_time: currentSession.end_time,
            end_time: nextSession.start_time,
            session_type: 'lunch_break',
            start_location_lat: null,
            start_location_lng: null,
            end_location_lat: null,
            end_location_lng: null,
            notes: 'Pausa pranzo rilevata automaticamente'
          };
          sessions.push(lunchBreakSession);
        }
      }
      
      // Reorder sessions and fix session_order
      sessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      sessions.forEach((session, index) => {
        session.session_order = index + 1;
      });
    }

    // Delete existing sessions for this timesheet first
    const { error: deleteError } = await supabase
      .from('timesheet_sessions')
      .delete()
      .eq('timesheet_id', timesheetRecord.id);

    if (deleteError) {
      console.error('Error deleting existing sessions:', deleteError);
      throw deleteError;
    }

    // Insert new sessions if any exist
    if (sessions.length > 0) {
      const { error: sessionsError } = await supabase
        .from('timesheet_sessions')
        .insert(sessions);

      if (sessionsError) {
        console.error('Error inserting sessions:', sessionsError);
        throw sessionsError;
      }
    }

    return timesheetRecord;
  }
}