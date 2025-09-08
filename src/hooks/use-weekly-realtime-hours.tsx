import { useState, useEffect } from 'react';
import { TimesheetWithProfile } from '@/types/timesheet';

export interface WeeklyRealtimeData {
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
}

export const useWeeklyRealtimeHours = (timesheets: TimesheetWithProfile[]): WeeklyRealtimeData => {
  const [realtimeData, setRealtimeData] = useState<WeeklyRealtimeData>({
    total_hours: 0,
    overtime_hours: 0,
    night_hours: 0
  });

  useEffect(() => {
    const calculateRealtimeHours = () => {
      let totalHours = 0;
      let overtimeHours = 0;
      let nightHours = 0;

      timesheets.forEach(timesheet => {
        // Se il timesheet è chiuso, usa i valori calcolati
        if (timesheet.end_time) {
          totalHours += timesheet.total_hours || 0;
          overtimeHours += timesheet.overtime_hours || 0;
          nightHours += timesheet.night_hours || 0;
        } 
        // Se è aperto (in corso), calcola le ore in tempo reale
        else if (timesheet.start_time) {
          const startTime = new Date(timesheet.start_time);
          const currentTime = new Date();
          const diffMs = currentTime.getTime() - startTime.getTime();
          const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
          
          totalHours += diffHours;
          
          // Calcolo approssimativo per straordinari (se > 8 ore)
          if (diffHours > 8) {
            overtimeHours += (diffHours - 8);
          }
          
          // Calcolo per ore notturne (se inizia prima delle 6 o dopo le 22)
          const startHour = startTime.getHours();
          if (startHour < 6 || startHour >= 22) {
            nightHours += diffHours;
          }
        }
      });

      setRealtimeData({
        total_hours: totalHours,
        overtime_hours: overtimeHours,
        night_hours: nightHours
      });
    };

    // Calcola subito
    calculateRealtimeHours();

    // Aggiorna ogni minuto
    const interval = setInterval(calculateRealtimeHours, 60000);

    return () => clearInterval(interval);
  }, [timesheets]);

  return realtimeData;
};