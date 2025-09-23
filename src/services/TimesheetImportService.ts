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
    
    console.log(`🔍 Creating sessions for timesheet ${timesheetRecord.id}:`, {
      date: timesheet.date,
      clockInTimes: timesheet.clockInTimes,
      clockOutTimes: timesheet.clockOutTimes,
      expectedSessions: Math.min(timesheet.clockInTimes.length, timesheet.clockOutTimes.length)
    });
    
    // Add work sessions for each clock-in/out pair
    const maxSessions = Math.min(timesheet.clockInTimes.length, timesheet.clockOutTimes.length);
    for (let i = 0; i < maxSessions; i++) {
      const clockIn = timesheet.clockInTimes[i];
      const clockOut = timesheet.clockOutTimes[i];
      
      if (clockIn && clockOut) {
        console.log(`🔍 Creating session ${i + 1}:`, { clockIn, clockOut });
        
        sessions.push({
          timesheet_id: timesheetRecord.id,
          session_order: i + 1,
          start_time: clockIn,
          end_time: clockOut,
          session_type: 'work',
          start_location_lat: i === 0 ? (timesheet.start_location_lat || null) : null,
          start_location_lng: i === 0 ? (timesheet.start_location_lng || null) : null,
          end_location_lat: i === maxSessions - 1 ? (timesheet.end_location_lat || null) : null,
          end_location_lng: i === maxSessions - 1 ? (timesheet.end_location_lng || null) : null,
          notes: `Sessione lavoro ${i + 1}`
        });
      }
    }
    
    console.log(`🔍 Total sessions created: ${sessions.length}`);

    // If we have more than one work session, try to detect lunch breaks
    if (sessions.length > 1) {
      console.log(`🔍 Detecting lunch breaks between ${sessions.length} sessions`);
      
      // Look for gaps between sessions that could be lunch breaks
      const lunchBreakSessions: Omit<TimesheetSession, 'id' | 'created_at' | 'updated_at'>[] = [];
      
      for (let i = 0; i < sessions.length - 1; i++) {
        const currentSession = sessions[i];
        const nextSession = sessions[i + 1];
        
        const gapStart = new Date(currentSession.end_time);
        const gapEnd = new Date(nextSession.start_time);
        const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);
        
        console.log(`🔍 Gap between session ${i + 1} and ${i + 2}: ${gapMinutes} minutes`);
        
        // If gap is between 15 minutes and 2 hours, consider it a lunch break
        if (gapMinutes >= 15 && gapMinutes <= 120) {
          console.log(`🔍 Creating lunch break session for ${gapMinutes} minute gap`);
          
          // Insert lunch break session
          const lunchBreakSession: Omit<TimesheetSession, 'id' | 'created_at' | 'updated_at'> = {
            timesheet_id: timesheetRecord.id,
            session_order: 0, // Will be set correctly after sorting
            start_time: currentSession.end_time,
            end_time: nextSession.start_time,
            session_type: 'lunch_break',
            start_location_lat: null,
            start_location_lng: null,
            end_location_lat: null,
            end_location_lng: null,
            notes: `Pausa pranzo automatica (${Math.round(gapMinutes)} min)`
          };
          lunchBreakSessions.push(lunchBreakSession);
        }
      }
      
      // Add lunch break sessions to the main array
      sessions.push(...lunchBreakSessions);
      
      // Reorder ALL sessions (work + lunch) chronologically and fix session_order
      sessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      sessions.forEach((session, index) => {
        session.session_order = index + 1;
      });
      
      console.log(`🔍 Final sessions after lunch break detection: ${sessions.length} (${sessions.filter(s => s.session_type === 'work').length} work + ${sessions.filter(s => s.session_type === 'lunch_break').length} lunch)`);
    } else {
      console.log(`🔍 Single session detected, no lunch break detection needed`);
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
      console.log(`🔍 Inserting ${sessions.length} sessions into database:`, sessions.map(s => ({
        order: s.session_order,
        type: s.session_type,
        start: s.start_time,
        end: s.end_time
      })));
      
      const { error: sessionsError } = await supabase
        .from('timesheet_sessions')
        .insert(sessions);

      if (sessionsError) {
        console.error('Error inserting sessions:', sessionsError);
        throw sessionsError;
      }
      
      console.log(`✅ Successfully inserted ${sessions.length} sessions`);
    } else {
      console.log(`⚠️ No sessions to insert for timesheet ${timesheetRecord.id}`);
    }

    return timesheetRecord;
  }
}