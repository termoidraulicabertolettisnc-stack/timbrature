/**
 * Monthly Overtime Compensation Logic
 * 
 * For employees with overtime_monthly_compensation = true:
 * - Overtime hours compensate days where ordinary hours are below contracted hours (deficit)
 * - The deficit is filled with overtime hours, increasing ordinary and reducing overtime
 */

export interface DayData {
  ordinary: number;
  overtime: number;
  absence: string | null;
}

export interface CompensationResult {
  dailyData: { [day: string]: DayData };
  totalOrdinary: number;
  totalOvertime: number;
  compensationDetails: {
    monthlyDeficit: number;
    compensableAbsenceHours: number;
    totalCompensableHours: number;
    hoursCompensated: number;
  };
  // Days where the deficit was fully compensated (ordinary >= contracted after compensation)
  fullyCompensatedDays: string[];
  // Days with residual deficit after compensation (need automatic absence)
  residualDeficitDays: { day: string; deficit: number }[];
}

/**
 * Apply monthly overtime compensation by filling deficit days with overtime hours
 */
export function applyMonthlyOvertimeCompensation(
  dailyData: { [day: string]: DayData },
  dailyContractedHours: { [day: string]: number },
  compensableAbsenceHours: number = 0
): CompensationResult {
  // Deep copy daily data
  const result: { [day: string]: DayData } = {};
  Object.keys(dailyData).forEach(day => {
    result[day] = { ...dailyData[day] };
  });

  // Step 1: Calculate total overtime available
  let totalOvertimeAvailable = Object.values(result).reduce((sum, d) => sum + (d.overtime || 0), 0);
  
  // Step 2: Identify deficit days and calculate total deficit
  const deficitDays: { day: string; deficit: number }[] = [];
  let monthlyDeficit = 0;
  
  Object.keys(result).forEach(day => {
    const contracted = dailyContractedHours[day] || 0;
    const ordinary = result[day].ordinary || 0;
    // Only count deficit if employee worked that day (ordinary > 0) and worked less than contracted
    if (ordinary > 0 && ordinary < contracted) {
      const deficit = contracted - ordinary;
      deficitDays.push({ day, deficit });
      monthlyDeficit += deficit;
    }
  });

  // Step 3: Total compensable hours = deficit + absences (excluding M and I)
  const totalCompensableHours = monthlyDeficit + compensableAbsenceHours;
  
  if (totalCompensableHours <= 0 || totalOvertimeAvailable <= 0) {
    // Even without overtime, we need to report residual deficits
    const residualDeficitDays: { day: string; deficit: number }[] = deficitDays.map(({ day, deficit }) => ({ day, deficit }));
    
    return {
      dailyData: result,
      totalOrdinary: Object.values(result).reduce((sum, d) => sum + (d.ordinary || 0), 0),
      totalOvertime: totalOvertimeAvailable,
      compensationDetails: {
        monthlyDeficit,
        compensableAbsenceHours,
        totalCompensableHours,
        hoursCompensated: 0
      },
      fullyCompensatedDays: [],
      residualDeficitDays
    };
  }

  // Step 4: Calculate how many hours to compensate (limited by available overtime)
  const hoursToCompensate = Math.min(totalCompensableHours, totalOvertimeAvailable);
  let remainingToCompensate = hoursToCompensate;

  // Step 5: First, fill deficit days with overtime
  // Sort deficit days by deficit size (largest first) to prioritize
  deficitDays.sort((a, b) => b.deficit - a.deficit);
  
  for (const { day, deficit } of deficitDays) {
    if (remainingToCompensate <= 0) break;
    
    // How much can we fill this day's deficit?
    const fillAmount = Math.min(deficit, remainingToCompensate);
    result[day].ordinary += fillAmount;
    remainingToCompensate -= fillAmount;
  }

  // Step 6: Reduce overtime proportionally from days with overtime
  const overtimeDays = Object.entries(result)
    .filter(([_, data]) => data.overtime > 0)
    .map(([day, data]) => ({ day, overtime: data.overtime }));
  
  if (overtimeDays.length > 0) {
    const totalOvertime = overtimeDays.reduce((sum, d) => sum + d.overtime, 0);
    let remainingToDeduct = hoursToCompensate;
    
    overtimeDays.forEach(({ day, overtime }, index) => {
      if (index === overtimeDays.length - 1) {
        // Last day: deduct all remaining to avoid rounding errors
        result[day].overtime = Math.max(0, overtime - remainingToDeduct);
      } else {
        const proportion = overtime / totalOvertime;
        const deduction = Math.min(overtime, hoursToCompensate * proportion);
        result[day].overtime = Math.max(0, overtime - deduction);
        remainingToDeduct -= deduction;
      }
    });
  }

  // Apply minimum threshold: overtime below 0.1 should be set to 0
  const OVERTIME_MIN_THRESHOLD = 0.1;
  Object.keys(result).forEach(day => {
    if (result[day].overtime > 0 && result[day].overtime < OVERTIME_MIN_THRESHOLD) {
      result[day].overtime = 0;
    }
  });

  // Calculate final totals
  const finalTotalOrdinary = Object.values(result).reduce((sum, d) => sum + (d.ordinary || 0), 0);
  const finalTotalOvertime = Object.values(result).reduce((sum, d) => sum + (d.overtime || 0), 0);

  // Identify fully compensated days and residual deficit days
  const fullyCompensatedDays: string[] = [];
  const residualDeficitDays: { day: string; deficit: number }[] = [];
  
  for (const { day } of deficitDays) {
    const contracted = dailyContractedHours[day] || 0;
    const ordinaryAfter = result[day].ordinary || 0;
    const residualDeficit = contracted - ordinaryAfter;
    
    // If ordinary hours now meet or exceed contracted hours, this day is fully compensated
    if (residualDeficit <= 0.01) { // Small tolerance for floating point
      fullyCompensatedDays.push(day);
    } else {
      // This day still has a deficit after compensation
      residualDeficitDays.push({ day, deficit: Math.round(residualDeficit * 100) / 100 });
    }
  }

  return {
    dailyData: result,
    totalOrdinary: finalTotalOrdinary,
    totalOvertime: finalTotalOvertime,
    compensationDetails: {
      monthlyDeficit,
      compensableAbsenceHours,
      totalCompensableHours,
      hoursCompensated: hoursToCompensate
    },
    fullyCompensatedDays,
    residualDeficitDays
  };
}
