import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

const TZ = 'Europe/Rome';

export type Seg = { 
  startUtc: string; 
  endUtc: string;
  sessionId?: string;
  sessionOrder?: number;
};

/**
 * Clamps a time segment to the bounds of a specific day in the given timezone
 */
export function splitAtMidnight(seg: Seg, dayISO: string, tz = TZ): Seg | null {
  // ✅ VALIDAZIONE ROBUSTA: Verifica che le date esistano e siano valide
  if (!seg || !seg.startUtc || !seg.endUtc) {
    console.warn('splitAtMidnight: Missing dates in segment', { seg });
    return null;
  }

  // ✅ VALIDAZIONE: Verifica che le date siano stringhe valide
  if (typeof seg.startUtc !== 'string' || typeof seg.endUtc !== 'string') {
    console.warn('splitAtMidnight: Invalid date types', { 
      startUtc: typeof seg.startUtc, 
      endUtc: typeof seg.endUtc,
      seg 
    });
    return null;
  }

  // ✅ VALIDAZIONE: Verifica che le date non siano vuote
  if (seg.startUtc.trim() === '' || seg.endUtc.trim() === '') {
    console.warn('splitAtMidnight: Empty date strings', { seg });
    return null;
  }

  const dayStart = startOfDay(new Date(dayISO + 'T00:00:00'));
  const dayEnd = endOfDay(new Date(dayISO + 'T00:00:00'));
  
  // Convert day bounds to UTC
  const dayStartUtc = fromZonedTime(dayStart, tz);
  const dayEndUtc = fromZonedTime(dayEnd, tz);
  
  // ✅ VALIDAZIONE: Prova a creare Date objects e verifica che siano validi
  const segStartUtc = new Date(seg.startUtc);
  const segEndUtc = new Date(seg.endUtc);
  
  // ✅ VALIDAZIONE: Verifica che le date siano valide (non NaN)
  if (isNaN(segStartUtc.getTime()) || isNaN(segEndUtc.getTime())) {
    console.warn('splitAtMidnight: Invalid segment dates', { 
      seg,
      startUtc_parsed: segStartUtc.toString(),
      endUtc_parsed: segEndUtc.toString(),
      startUtc_valid: !isNaN(segStartUtc.getTime()),
      endUtc_valid: !isNaN(segEndUtc.getTime())
    });
    return null;
  }
  
  // Check if segment intersects with the day
  if (segEndUtc <= dayStartUtc || segStartUtc >= dayEndUtc) {
    return null;
  }
  
  // Clamp segment to day bounds
  const clampedStart = segStartUtc < dayStartUtc ? dayStartUtc : segStartUtc;
  const clampedEnd = segEndUtc > dayEndUtc ? dayEndUtc : segEndUtc;
  
  return {
    startUtc: clampedStart.toISOString(),
    endUtc: clampedEnd.toISOString(),
    sessionId: seg.sessionId,
    sessionOrder: seg.sessionOrder
  };
}

/**
 * Returns all work sessions for a specific day, properly segmented at midnight
 */
export function sessionsForDay(timesheet: any, dayISO: string, tz = TZ): Seg[] {
  console.log('🔍 sessionsForDay:', { dayISO, timesheet_id: timesheet.id });
  
  const out: Seg[] = [];
  
  const sessions = timesheet.timesheet_sessions || [];
  
  if (sessions.length > 0) {
    for (const session of sessions) {
      if (session.start_time && session.end_time) {
        const part = splitAtMidnight({
          startUtc: session.start_time,
          endUtc: session.end_time,
          sessionId: session.id,
          sessionOrder: session.session_order
        }, dayISO, tz);
        
        if (part) {
          out.push(part);
        }
      }
    }
  } else {
    // Fallback legacy: generate synthetic session from timesheet start/end times
    if (timesheet.start_time && timesheet.end_time) {
      const part = splitAtMidnight({
        startUtc: timesheet.start_time,
        endUtc: timesheet.end_time,
        sessionId: `legacy-${timesheet.id}`,
        sessionOrder: 1
      }, dayISO, tz);
      
      if (part) {
        out.push(part);
      }
    }
  }
  
  console.log('✅ sessionsForDay RESULT:', { dayISO, count: out.length });
  return out;
}

/**
 * Calculate dynamic hour bounds from segments
 */
export function calculateDynamicBounds(segments: Seg[], tz = TZ): { startHour: number; endHour: number } {
  if (segments.length === 0) {
    return { startHour: 8, endHour: 18 };
  }
  
  let minHour = 24;
  let maxHour = 0;
  
  for (const seg of segments) {
    const localStart = toZonedTime(new Date(seg.startUtc), tz);
    const localEnd = toZonedTime(new Date(seg.endUtc), tz);
    
    const startH = localStart.getHours() + localStart.getMinutes() / 60;
    const endH = localEnd.getHours() + localEnd.getMinutes() / 60;
    
    minHour = Math.min(minHour, Math.floor(startH));
    maxHour = Math.max(maxHour, Math.ceil(endH));
  }
  
  // Add some padding
  const startHour = Math.max(0, minHour - 1);
  const endHour = Math.min(24, maxHour + 1);
  
  return { startHour, endHour };
}

/**
 * Convert local time input to UTC for storage
 */
export function localToUtc(localDate: Date, tz = TZ): string {
  return fromZonedTime(localDate, tz).toISOString();
}

/**
 * Convert UTC time to local for display
 */
export function utcToLocal(utcString: string, tz = TZ): Date {
  return toZonedTime(new Date(utcString), tz);
}
