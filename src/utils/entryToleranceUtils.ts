/**
 * Utility functions for entry time tolerance system
 */

/**
 * Apply entry tolerance to a start time based on standard time and tolerance minutes
 * If the entry time is within tolerance of the standard time, normalize to standard time
 * 
 * @param startTime - The actual entry time (Date object)
 * @param standardStartTime - Standard start time in HH:MM:SS format (e.g., "08:00:00")
 * @param toleranceMinutes - Tolerance in minutes (e.g., 10)
 * @returns The adjusted start time (Date object)
 */
export function applyEntryTolerance(
  startTime: Date,
  standardStartTime: string,
  toleranceMinutes: number
): Date {
  // Parse standard start time
  const [hours, minutes, seconds] = standardStartTime.split(':').map(Number);
  
  // Create standard time for the same date as start time
  const standardDate = new Date(startTime);
  standardDate.setHours(hours, minutes, seconds || 0, 0);
  
  // Calculate tolerance window
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const toleranceStart = new Date(standardDate.getTime() - toleranceMs);
  const toleranceEnd = new Date(standardDate.getTime() + toleranceMs);
  
  // Check if start time is within tolerance
  if (startTime >= toleranceStart && startTime <= toleranceEnd) {
    // Return the standard time (normalized)
    return standardDate;
  }
  
  // Return original time if outside tolerance
  return startTime;
}

/**
 * Check if entry tolerance should be applied for a given date and settings
 */
export function shouldApplyEntryTolerance(
  employeeSettings: any,
  companySettings: any
): { enabled: boolean; standardTime?: string; tolerance?: number } {
  // Check employee-specific setting first, then company setting
  const enabled = employeeSettings?.enable_entry_tolerance !== null 
    ? employeeSettings?.enable_entry_tolerance 
    : companySettings?.enable_entry_tolerance || false;
    
  if (!enabled) {
    return { enabled: false };
  }
  
  const standardTime = employeeSettings?.standard_start_time || companySettings?.standard_start_time || '08:00:00';
  const tolerance = employeeSettings?.entry_tolerance_minutes !== null 
    ? employeeSettings?.entry_tolerance_minutes 
    : companySettings?.entry_tolerance_minutes || 10;
  
  return {
    enabled: true,
    standardTime,
    tolerance
  };
}