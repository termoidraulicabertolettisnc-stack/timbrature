import { useState, useEffect } from 'react';

interface TimesheetData {
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
}

export const useRealtimeHours = (timesheet: TimesheetData) => {
  const [realtimeHours, setRealtimeHours] = useState<number | null>(null);

  useEffect(() => {
    // Se il timesheet è già chiuso, usa le ore totali calcolate
    if (timesheet.end_time || !timesheet.start_time) {
      setRealtimeHours(timesheet.total_hours);
      return;
    }

    // Calcola le ore in tempo reale per timesheet aperti
    const calculateCurrentHours = () => {
      if (!timesheet.start_time) return 0;
      
      const startTime = new Date(timesheet.start_time);
      const currentTime = new Date();
      const diffMs = currentTime.getTime() - startTime.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      return Math.max(0, diffHours);
    };

    // Calcola subito
    setRealtimeHours(calculateCurrentHours());

    // Aggiorna ogni minuto
    const interval = setInterval(() => {
      setRealtimeHours(calculateCurrentHours());
    }, 60000);

    return () => clearInterval(interval);
  }, [timesheet.start_time, timesheet.end_time, timesheet.total_hours]);

  return realtimeHours;
};