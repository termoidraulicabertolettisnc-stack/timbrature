import { supabase } from '@/integrations/supabase/client';
import { TimesheetSession } from '@/types/timesheet-session';
import { ParsedTimesheet } from './ExcelImportService';

type ImportOutcome = {
  timesheetId: string;
  sessionsInserted: number;
  totalHours: number;
};

function pairSessions(inTimes: string[], outTimes: string[]) {
  console.log(`🔍 PAIRING SESSIONS - Input:`, {
    inTimes_count: inTimes?.length || 0,
    outTimes_count: outTimes?.length || 0,
    inTimes: inTimes,
    outTimes: outTimes
  });
  
  // Usa la coppia minima per evitare end_time null
  const n = Math.min(inTimes.length, outTimes.length);
  const pairs: { start: string; end: string }[] = [];
  
  for (let i = 0; i < n; i++) {
    const start = inTimes[i];
    const end = outTimes[i];
    
    console.log(`🔍 PAIRING SESSION ${i + 1}:`, { start, end });
    
    if (!start || !end) {
      console.log(`❌ SKIPPING SESSION ${i + 1}: Missing start or end time`);
      continue;
    }
    
    // Scarta intervalli invertiti o troppo brevi
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    
    console.log(`🔍 TIME VALIDATION SESSION ${i + 1}:`, {
      start_parsed: new Date(start).toISOString(),
      end_parsed: new Date(end).toISOString(),
      startTime,
      endTime,
      duration_minutes: (endTime - startTime) / (1000 * 60),
      is_valid_order: startTime < endTime,
      is_long_enough: (endTime - startTime) >= 60000
    });
    
    if (startTime >= endTime) {
      console.log(`❌ SKIPPING SESSION ${i + 1}: Invalid time order (start >= end)`);
      continue;
    }
    
    if (endTime - startTime < 60000) { // Almeno 1 minuto
      console.log(`❌ SKIPPING SESSION ${i + 1}: Duration too short (< 1 minute)`);
      continue;
    }
    
    console.log(`✅ ACCEPTING SESSION ${i + 1}`);
    pairs.push({ start, end });
  }
  
  console.log(`🔍 PAIRING RESULT: ${pairs.length} valid sessions out of ${n} possible`);
  return pairs;
}

export class TimesheetImportService {
  static async importTimesheet(timesheet: ParsedTimesheet, employee: { user_id: string }): Promise<ImportOutcome> {
    console.log(`🔍 IMPORT START - TimesheetImportService.importTimesheet called:`, {
      timesheet: {
        employee_name: timesheet.employee_name,
        date: timesheet.date,
        total_hours: timesheet.total_hours,
        clockInTimes: timesheet.clockInTimes?.length || 0,
        clockOutTimes: timesheet.clockOutTimes?.length || 0
      },
      employee: employee
    });

    // Get current user for created_by field
    const currentUserResult = await supabase.auth.getUser();
    const currentUserId = currentUserResult.data.user?.id;
    
    if (!currentUserId) {
      throw new Error('Utente non autenticato');
    }
    
    // 1) UPSERT del timesheet (idempotente sul giorno/utente)
    const timesheetData = {
      user_id: employee.user_id,
      date: timesheet.date,
      is_absence: false, // Le sessioni determineranno se ci sono ore lavorate
      notes: timesheet.notes || `Importato da Excel - ${timesheet.employee_name}`,
      created_by: currentUserId,
      project_id: null
    };

    console.log(`🔍 TIMESHEET DATA TO UPSERT:`, timesheetData);

    const { data: timesheetRecord, error: timesheetError } = await supabase
      .from('timesheets')
      .upsert(timesheetData, { 
        onConflict: 'user_id,date',
        ignoreDuplicates: false 
      })
      .select('id')
      .single();

    if (timesheetError || !timesheetRecord?.id) {
      throw new Error(`Impossibile creare/aggiornare timesheet (${timesheet.employee_name} - ${timesheet.date}): ${timesheetError?.message || 'no id returned'}`);
    }

    const timesheetId = timesheetRecord.id;
    console.log(`✅ TIMESHEET UPSERTED SUCCESSFULLY:`, timesheetId);

    // 2) PULIZIA sessioni precedenti (reimport idempotente)
    const { error: delError } = await supabase
      .from('timesheet_sessions')
      .delete()
      .eq('timesheet_id', timesheetId);

    if (delError) {
      throw new Error(`Pulizia sessioni fallita (${timesheet.employee_name} - ${timesheet.date}): ${delError.message}`);
    }

    console.log(`🔍 Cleaned existing sessions for timesheet ${timesheetId}`);

    // 3) CREA le sessioni di lavoro (pairing robusto)
    const pairs = pairSessions(timesheet.clockInTimes || [], timesheet.clockOutTimes || []);
    if (pairs.length === 0) {
      console.log(`⚠️ No valid session pairs found for ${timesheet.employee_name} on ${timesheet.date}`);
      // Niente sessioni: lasciamo il timesheet senza ore (ma almeno non esplode)
      return { timesheetId, sessionsInserted: 0, totalHours: 0 };
    }

    console.log(`🔍 Creating ${pairs.length} work sessions for timesheet ${timesheetId}:`, pairs);

    const workSessions = pairs.map((p, idx) => ({
      timesheet_id: timesheetId,
      session_type: 'work' as const,
      session_order: idx + 1,
      start_time: p.start,
      end_time: p.end,
      start_location_lat: idx === 0 ? (timesheet.start_location_lat || null) : null,
      start_location_lng: idx === 0 ? (timesheet.start_location_lng || null) : null,
      end_location_lat: idx === pairs.length - 1 ? (timesheet.end_location_lat || null) : null,
      end_location_lng: idx === pairs.length - 1 ? (timesheet.end_location_lng || null) : null,
      notes: `Sessione lavoro ${idx + 1} (importata)`
    }));

    // 4) DETECT lunch breaks per sessioni multiple
    const allSessions: Array<{
      timesheet_id: string;
      session_type: 'work' | 'lunch_break';
      session_order: number;
      start_time: string;
      end_time: string;
      start_location_lat: number | null;
      start_location_lng: number | null;
      end_location_lat: number | null;
      end_location_lng: number | null;
      notes: string;
    }> = [...workSessions];
    
    if (workSessions.length > 1) {
      console.log(`🔍 Detecting lunch breaks between ${workSessions.length} work sessions`);
      
      for (let i = 0; i < workSessions.length - 1; i++) {
        const currentSession = workSessions[i];
        const nextSession = workSessions[i + 1];
        
        const gapStart = new Date(currentSession.end_time);
        const gapEnd = new Date(nextSession.start_time);
        const gapMinutes = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60);
        
        console.log(`🔍 Gap between session ${i + 1} and ${i + 2}: ${gapMinutes} minutes`);
        
        // Se gap è tra 15 minuti e 2 ore, consideralo pausa pranzo
        if (gapMinutes >= 15 && gapMinutes <= 120) {
          console.log(`🔍 Creating lunch break session for ${gapMinutes} minute gap`);
          
          const lunchSession = {
            timesheet_id: timesheetId,
            session_type: 'lunch_break' as const,
            session_order: 0, // Verrà corretto dopo sorting
            start_time: currentSession.end_time,
            end_time: nextSession.start_time,
            start_location_lat: null,
            start_location_lng: null,
            end_location_lat: null,
            end_location_lng: null,
            notes: `Pausa pranzo automatica (${Math.round(gapMinutes)} min)`
          };
          allSessions.push(lunchSession);
        }
      }
      
      // Riordina tutte le sessioni cronologicamente e sistema session_order
      allSessions.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      allSessions.forEach((session, index) => {
        session.session_order = index + 1;
      });
      
      console.log(`🔍 Final sessions: ${allSessions.length} total (${allSessions.filter(s => s.session_type === 'work').length} work + ${allSessions.filter(s => s.session_type === 'lunch_break').length} lunch)`);
    }

    // 5) INSERT sessioni nel database
    const { error: insErr } = await supabase
      .from('timesheet_sessions')
      .insert(allSessions);

    if (insErr) {
      throw new Error(`Inserimento sessioni fallito (${timesheet.employee_name} - ${timesheet.date}): ${insErr.message}`);
    }

    // Calcola ore totali per il ritorno
    let totalMinutes = 0;
    workSessions.forEach(session => {
      const start = new Date(session.start_time).getTime();
      const end = new Date(session.end_time).getTime();
      totalMinutes += (end - start) / (1000 * 60);
    });
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    console.log(`✅ Successfully imported timesheet with ${allSessions.length} sessions, ${totalHours}h total`);

    return { 
      timesheetId, 
      sessionsInserted: allSessions.length, 
      totalHours 
    };
  }
}