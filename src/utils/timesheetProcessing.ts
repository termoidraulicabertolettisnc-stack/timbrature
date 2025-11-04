import { toZonedTime } from 'date-fns-tz';
import { applyEntryTolerance, shouldApplyEntryTolerance } from './entryToleranceUtils';

/**
 * Applies entry tolerance to a timesheet's sessions or legacy format
 * Follows hierarchy: day settings -> employee settings -> company settings -> defaults
 */
export function applyEntryToleranceToTimesheet(
  timesheet: any,
  temporalSettings: any,
  companySettings: any
): any {
  const processedTimesheet = { ...timesheet };
  const toleranceConfig = shouldApplyEntryTolerance(temporalSettings, companySettings);
  
  // Check if we have sessions (new format) or legacy format
  if (processedTimesheet.timesheet_sessions && processedTimesheet.timesheet_sessions.length > 0) {
    // Apply tolerance to the first session's start time
    if (toleranceConfig.enabled && toleranceConfig.standardTime && toleranceConfig.tolerance !== undefined) {
      const sortedSessions = [...processedTimesheet.timesheet_sessions].sort((a, b) => 
        (a.session_order || 0) - (b.session_order || 0)
      );
      
      if (sortedSessions.length > 0 && sortedSessions[0].start_time) {
        const adjustedStartTime = applyEntryTolerance(
          new Date(sortedSessions[0].start_time),
          toleranceConfig.standardTime,
          toleranceConfig.tolerance
        );
        // Create a new sessions array with the adjusted first session
        processedTimesheet.timesheet_sessions = sortedSessions.map((session, idx) => 
          idx === 0 
            ? { ...session, start_time: adjustedStartTime.toISOString() }
            : session
        );
      }
    }
  } else if (processedTimesheet.start_time) {
    // Legacy format - apply tolerance to main timesheet start_time
    if (toleranceConfig.enabled && toleranceConfig.standardTime && toleranceConfig.tolerance !== undefined) {
      const adjustedStartTime = applyEntryTolerance(
        new Date(processedTimesheet.start_time),
        toleranceConfig.standardTime,
        toleranceConfig.tolerance
      );
      processedTimesheet.start_time = adjustedStartTime.toISOString();
    }
  }

  return processedTimesheet;
}

/**
 * Determines which calendar days are affected by a timesheet
 * Handles both new session format and legacy format
 * Follows hierarchy: day settings -> employee settings -> company settings -> defaults
 */
export function determineAffectedDays(
  timesheet: any,
  year: string,
  month: string,
  timezone: string = 'Europe/Rome'
): Set<string> {
  const affectedDays = new Set<string>();
  const monthStart = `${year}-${month}-01`;
  const monthEnd = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;
  
  // Check if we have sessions (new format) or legacy format
  if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
    // New format with sessions
    for (const session of timesheet.timesheet_sessions) {
      if (session.start_time && session.end_time) {
        // Convert UTC to local timezone to determine which local days are affected
        const sessionStart = toZonedTime(new Date(session.start_time), timezone);
        const sessionEnd = toZonedTime(new Date(session.end_time), timezone);
        
        // Extract local date using local methods (NOT .toISOString() which uses UTC)
        let currentDate = new Date(sessionStart);
        currentDate.setHours(0, 0, 0, 0);
        const endDate = new Date(sessionEnd);
        endDate.setHours(0, 0, 0, 0);
        
        while (currentDate <= endDate) {
          const dayISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          if (dayISO >= monthStart && dayISO <= monthEnd) {
            affectedDays.add(dayISO);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }
  } else if (timesheet.start_time && timesheet.end_time) {
    // Legacy format with ZONED dates
    const startDate = toZonedTime(new Date(timesheet.start_time), timezone);
    const endDate = toZonedTime(new Date(timesheet.end_time), timezone);
    
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(0, 0, 0, 0);
    
    while (currentDate <= endDateNormalized) {
      const dayISO = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      if (dayISO >= monthStart && dayISO <= monthEnd) {
        affectedDays.add(dayISO);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // Fallback: if no days were added (sessions without times), use timesheet.date
  if (affectedDays.size === 0) {
    affectedDays.add(timesheet.date);
  }

  return affectedDays;
}

/**
 * Calculates lunch break minutes to subtract from day hours
 * Follows hierarchy: explicit lunch -> manual lunch -> default lunch from settings
 */
export function calculateLunchBreakMinutes(
  timesheet: any,
  dayHours: number,
  temporalSettings: any,
  companySettings: any
): number {
  // Priority 1: Explicit lunch duration
  if (timesheet.lunch_duration_minutes && timesheet.lunch_duration_minutes > 0) {
    return timesheet.lunch_duration_minutes;
  }
  
  // Priority 2: Explicit lunch times
  if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
    const lunchStart = new Date(timesheet.lunch_start_time);
    const lunchEnd = new Date(timesheet.lunch_end_time);
    if (!isNaN(lunchStart.getTime()) && !isNaN(lunchEnd.getTime())) {
      return (lunchEnd.getTime() - lunchStart.getTime()) / (1000 * 60);
    }
  }
  
  // Priority 3: Default lunch break from settings (only if no explicit lunch break)
  if (!timesheet.lunch_duration_minutes && !timesheet.lunch_start_time) {
    // Hierarchy: employee settings -> company settings -> default
    const minHoursForLunch = companySettings?.lunch_break_min_hours || 6;
    if (dayHours > minHoursForLunch) {
      const lunchBreakType = temporalSettings?.lunch_break_type || companySettings?.lunch_break_type || '60_minuti';
      if (lunchBreakType !== '0_minuti' && lunchBreakType !== 'libera') {
        const lunchMinutes = parseInt(lunchBreakType.split('_')[0]) || 60;
        return lunchMinutes;
      }
    }
  }
  
  return 0;
}

/**
 * Calculates ordinary and overtime hours based on day hours vs contractual hours
 * Follows hierarchy: day settings -> employee settings -> company settings -> defaults
 */
export function calculateOrdinaryAndOvertime(
  dayHours: number,
  contractualHours: number
): { ordinary: number; overtime: number } {
  const ordinary = Math.min(dayHours, contractualHours);
  const overtime = Math.max(0, dayHours - contractualHours);
  
  return { ordinary, overtime };
}

/**
 * Validates if a day's segments have valid duration
 */
export function hasValidSegmentDuration(segments: any[]): boolean {
  if (segments.length === 0) return false;
  
  return segments.some(seg => {
    const start = new Date(seg.startUtc);
    const end = new Date(seg.endUtc);
    return (end.getTime() - start.getTime()) > 0;
  });
}

/**
 * Gets the effective timezone for a company
 * Follows hierarchy: company settings -> default
 */
export function getEffectiveTimezone(companySettings: any): string {
  return companySettings?.timezone || 'Europe/Rome';
}
