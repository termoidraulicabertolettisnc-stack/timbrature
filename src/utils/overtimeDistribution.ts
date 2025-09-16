/**
 * Utility functions for distributing overtime conversions proportionally across days with overtime
 */

export interface DayData {
  [day: string]: {
    ordinary?: number;
    overtime?: number;
    absence?: string | null;
    business_trip?: number | boolean;
  };
}

export interface OvertimeDistribution {
  day: string;
  originalOvertime: number;
  convertedOvertime: number;
  remainingOvertime: number;
}

/**
 * Distributes converted overtime hours proportionally across days with overtime
 */
export function distributeConvertedOvertime(
  dailyData: DayData,
  totalConvertedHours: number
): OvertimeDistribution[] {
  // Find all days with overtime
  const overtimeDays = Object.entries(dailyData)
    .filter(([_, data]) => data.overtime && data.overtime > 0)
    .map(([day, data]) => ({
      day,
      overtime: data.overtime!
    }));

  if (overtimeDays.length === 0 || totalConvertedHours <= 0) {
    return [];
  }

  // Calculate total overtime hours across all days
  const totalOvertimeHours = overtimeDays.reduce((sum, day) => sum + day.overtime, 0);

  // If converted hours exceed total overtime, cap at total
  const actualConvertedHours = Math.min(totalConvertedHours, totalOvertimeHours);

  // Distribute proportionally
  const distributions: OvertimeDistribution[] = [];
  let remainingToDistribute = actualConvertedHours;

  overtimeDays.forEach((dayInfo, index) => {
    const proportion = dayInfo.overtime / totalOvertimeHours;
    let convertedForDay: number;

    // For the last day, assign all remaining hours to avoid rounding errors
    if (index === overtimeDays.length - 1) {
      convertedForDay = remainingToDistribute;
    } else {
      convertedForDay = Math.round((actualConvertedHours * proportion) * 100) / 100;
      remainingToDistribute -= convertedForDay;
    }

    // Ensure we don't convert more than available for this day
    convertedForDay = Math.min(convertedForDay, dayInfo.overtime);

    distributions.push({
      day: dayInfo.day,
      originalOvertime: dayInfo.overtime,
      convertedOvertime: convertedForDay,
      remainingOvertime: dayInfo.overtime - convertedForDay
    });
  });

  return distributions;
}

/**
 * Applies the overtime distribution to daily data, modifying overtime values
 */
export function applyOvertimeDistribution(
  dailyData: DayData,
  distributions: OvertimeDistribution[]
): DayData {
  const updatedData = { ...dailyData };

  distributions.forEach(dist => {
    if (updatedData[dist.day]) {
      updatedData[dist.day] = {
        ...updatedData[dist.day],
        overtime: dist.remainingOvertime
      };
    }
  });

  return updatedData;
}