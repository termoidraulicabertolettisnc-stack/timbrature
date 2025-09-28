import { useState, useEffect } from 'react';
import { format, parseISO, eachHourOfInterval, addHours, startOfHour, isSameHour, differenceInMinutes, isValid, isSameDay, addDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, Zap, Moon, Utensils, Euro, TreePalm, Stethoscope, AlertTriangle, CircleSlash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimesheetWithProfile } from '@/types/timesheet';
import { supabase } from '@/integrations/supabase/client';
import { sessionsForDay, calculateDynamicBounds, utcToLocal, type Seg } from '@/utils/timeSegments';

interface TimeBlock {
  timesheet: TimesheetWithProfile;
  startMinutes: number;
  endMinutes: number;
  isLunchBreak: boolean;
  type: 'work' | 'overtime' | 'night';
  startDate: string;
  endDate: string;
}

interface TimesheetTimelineProps {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  weekDays: Date[];
  onTimesheetClick?: (timesheet: TimesheetWithProfile) => void;
}

export function TimesheetTimeline({ timesheets, absences, weekDays, onTimesheetClick }: TimesheetTimelineProps) {
  const [selectedTimesheet, setSelectedTimesheet] = useState<string | null>(null);
  const [employeeSettings, setEmployeeSettings] = useState<any>({});
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [realtimeTimesheets, setRealtimeTimesheets] = useState<TimesheetWithProfile[]>(timesheets);

  // Get unique employee user_ids from timesheets
  const employeeUserIds = [...new Set(timesheets.map(ts => ts.user_id))];

  // Update local state when props change
  useEffect(() => {
    setRealtimeTimesheets(timesheets);
  }, [timesheets]);

  // Set up realtime updates for timesheets
  useEffect(() => {
    const channel = supabase
      .channel('timesheet-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timesheets'
        },
        (payload) => {
          console.log('🔄 Timesheet realtime update:', payload);
          // Refresh timesheets when changes occur
          if (payload.new && payload.eventType !== 'DELETE') {
            setRealtimeTimesheets(prev => 
              prev.map(ts => ts.id === payload.new.id ? { ...ts, ...payload.new } : ts)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Timer to refresh calculations for open timesheets every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const hasOpenTimesheets = realtimeTimesheets.some(ts => 
        ts.start_time && !ts.end_time && 
        format(new Date(ts.date), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')
      );
      
      if (hasOpenTimesheets) {
        console.log('⏰ Refreshing open timesheet calculations');
        // Force re-render by updating a dummy state
        setSelectedTimesheet(prev => prev);
      }
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, [realtimeTimesheets]);

  useEffect(() => {
    const loadEmployeeSettings = async () => {
      if (employeeUserIds.length === 0) return;

      try {
        // Load employee settings and company settings
        const { data: empSettings } = await supabase
          .from('employee_settings')
          .select('*')
          .in('user_id', employeeUserIds);

        const { data: companySettingsData } = await supabase
          .from('company_settings')
          .select('*')
          .limit(1)
          .single();

        const settingsMap: any = {};
        empSettings?.forEach(emp => {
          settingsMap[emp.user_id] = emp;
        });

        setEmployeeSettings(settingsMap);
        setCompanySettings(companySettingsData);
      } catch (error) {
        console.error('Error loading employee settings:', error);
      }
    };

    loadEmployeeSettings();
  }, [employeeUserIds.join(',')]);
           
            // Get temporal settings for this specific date
            const temporalSettings = await getEmployeeSettingsForDate(timesheet.user_id, timesheet.date);
            
            const mealBenefits = await calculateMealBenefitsTemporal(
              timesheet,
              temporalSettings ? {
                meal_allowance_policy: temporalSettings.meal_allowance_policy,
                meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
                daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
                lunch_break_type: temporalSettings.lunch_break_type
              } : undefined,
              companySettings,
              timesheet.date
            );
            
            cache[timesheet.id] = {
              mealVoucher: mealBenefits.mealVoucher,
              dailyAllowance: mealBenefits.dailyAllowance
            };
          } catch (error) {
            console.error('Error computing meal benefits for timesheet', timesheet.id, error);
            cache[timesheet.id] = { mealVoucher: false, dailyAllowance: false };
          }
        }
      }
      
      setMealBenefitsCache(cache);
    };

    if (realtimeTimesheets.length > 0 && companySettings) {
      computeMealBenefits();
    }
  }, [realtimeTimesheets, companySettings]);

  // Get cached meal benefits for a timesheet
  const getMealVoucher = (timesheet: TimesheetWithProfile): boolean => {
    return timesheet.meal_voucher_earned || false;
  };

  // Legge le ore dal database (già calcolate)
  const getTimesheetHours = (timesheet: TimesheetWithProfile): number => {
    return timesheet.total_hours || 0;
  };
    
    const diffMs = endTime.getTime() - startTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // Sottrai la pausa pranzo se necessario
    const settings = employeeSettings[timesheet.user_id];
    
    let lunchBreakHours = 0;
    if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
      const lunchStart = new Date(timesheet.lunch_start_time);
      const lunchEnd = new Date(timesheet.lunch_end_time);
      lunchBreakHours = (lunchEnd.getTime() - lunchStart.getTime()) / (1000 * 60 * 60);
    } else if (timesheet.lunch_duration_minutes) {
      lunchBreakHours = timesheet.lunch_duration_minutes / 60;
    } else if (diffHours > 6) {
      // Pausa pranzo automatica se più di 6 ore
      const lunchBreakType = settings?.lunch_break_type || companySettings?.lunch_break_type || '60_minuti';
      const lunchMinutes = parseInt(lunchBreakType.split('_')[0]) || 60;
      lunchBreakHours = lunchMinutes / 60;
    }
    
    return Math.max(0, diffHours - lunchBreakHours);
  };

  // Calculate if timesheet qualifies for daily allowance using temporal settings
  const calculateDailyAllowanceEarned = async (timesheet: TimesheetWithProfile): Promise<boolean> => {
    const { calculateMealBenefitsTemporal } = await import('@/utils/mealBenefitsCalculator');
    const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
    
    // Get temporal settings for this specific date
    const temporalSettings = await getEmployeeSettingsForDate(timesheet.user_id, timesheet.date);
    
    const mealBenefits = await calculateMealBenefitsTemporal(
      timesheet,
      temporalSettings ? {
        meal_allowance_policy: temporalSettings.meal_allowance_policy,
        meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
        daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
        lunch_break_type: temporalSettings.lunch_break_type
      } : undefined,
      companySettings,
      timesheet.date
    );
    
    console.log(`💰 Daily allowance for ${timesheet.id} (${timesheet.date}):`, {
      workedHours: mealBenefits.workedHours.toFixed(2),
      temporalSettings: temporalSettings?.meal_allowance_policy,
      calculated: mealBenefits.dailyAllowance
    });
    
    return mealBenefits.dailyAllowance;
  };

  // Calculate if timesheet qualifies for meal voucher using temporal settings
  const calculateMealVoucherEarned = async (timesheet: TimesheetWithProfile): Promise<boolean> => {
    const { calculateMealBenefitsTemporal } = await import('@/utils/mealBenefitsCalculator');
    const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
    
    // Get temporal settings for this specific date
    const temporalSettings = await getEmployeeSettingsForDate(timesheet.user_id, timesheet.date);
    
    const mealBenefits = await calculateMealBenefitsTemporal(
      timesheet,
      temporalSettings ? {
        meal_allowance_policy: temporalSettings.meal_allowance_policy,
        meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
        daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
        lunch_break_type: temporalSettings.lunch_break_type
      } : undefined,
      companySettings,
      timesheet.date
    );
    
    console.log(`🍽️ Meal voucher for ${timesheet.id} (${timesheet.date}):`, {
      workedHours: mealBenefits.workedHours.toFixed(2),
      temporalSettings: temporalSettings?.meal_allowance_policy,
      dbValue: timesheet.meal_voucher_earned,
      calculated: mealBenefits.mealVoucher
    });
    
    return mealBenefits.mealVoucher;
  };

  // Orari di riferimento dinamici
  const HOUR_HEIGHT = 60; // pixels per hour
  
  // Converte timestamp in minuti dal midnight
  const timeToMinutes = (timeString: string): number => {
    try {
      // Prima prova con parseISO per timestamp completi
      let time = parseISO(timeString);
      
      // Se la data è invalida, potrebbe essere solo un orario (HH:mm:ss)
      if (!isValid(time)) {
        // Prova a parsare come orario puro aggiungendo una data
        const timeOnly = timeString.match(/^(\d{2}):(\d{2}):?(\d{2})?$/);
        if (timeOnly) {
          const hours = parseInt(timeOnly[1], 10);
          const minutes = parseInt(timeOnly[2], 10);
          return hours * 60 + minutes;
        }
        // Fallback: prova con una data base
        time = parseISO(`2024-01-01T${timeString}`);
      }
      
      if (!isValid(time)) {
        console.warn('Invalid time format:', timeString);
        return 0;
      }
      
      return time.getHours() * 60 + time.getMinutes();
    } catch (error) {
      console.warn('Error parsing time:', timeString, error);
      return 0;
    }
  };

  // Calculate dynamic hours using the new utility
  const calculateDynamicHours = (): {startHour: number, endHour: number} => {
    const allSegments: Seg[] = [];
    
    timesheets.forEach(timesheet => {
      weekDays.forEach(day => {
        const dayISO = format(day, 'yyyy-MM-dd');
        const segments = sessionsForDay(timesheet, dayISO);
        allSegments.push(...segments);
      });
    });
    
    const { startHour, endHour } = calculateDynamicBounds(allSegments);
    return { startHour: Math.max(6, startHour), endHour: Math.min(22, endHour) };
  };
  
  const {startHour: DYNAMIC_START_HOUR, endHour: DYNAMIC_END_HOUR} = calculateDynamicHours();
  const TOTAL_HOURS = DYNAMIC_END_HOUR - DYNAMIC_START_HOUR;
  const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

  // Genera le ore di riferimento dinamicamente
  const timelineHours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
    const hour = DYNAMIC_START_HOUR + i;
    return hour > 24 ? hour - 24 : hour; // Gestisce il passaggio dopo mezzanotte
  });

  // Converte minuti dal midnight in posizione Y
  const minutesToPosition = (minutes: number): number => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    
    if (hour < DYNAMIC_START_HOUR && DYNAMIC_START_HOUR > 0) return 0;
    
    // Per ore dopo mezzanotte (es. 01:00 = 25 nell'ora estesa)
    let adjustedHour = hour;
    if (hour < DYNAMIC_START_HOUR && DYNAMIC_END_HOUR > 24) {
      adjustedHour = hour + 24;
    }
    
    if (adjustedHour >= DYNAMIC_END_HOUR) return TIMELINE_HEIGHT;
    
    return ((adjustedHour - DYNAMIC_START_HOUR) * 60 + minute) * (HOUR_HEIGHT / 60);
  };

  // Calculate time blocks using the new utility functions
  const calculateTimeBlocks = (dayTimesheets: TimesheetWithProfile[], dayDate: Date): TimeBlock[] => {
    const currentDayStr = format(dayDate, 'yyyy-MM-dd');
    console.debug('sessionsForDay', { dayISO: currentDayStr, timesheets: dayTimesheets.length });

    if (dayTimesheets.length === 0) return [];

    const blocks: TimeBlock[] = [];

    // Processa ogni timesheet e le sue sessioni
    dayTimesheets.forEach(timesheet => {
      console.log(`🔍 Processing timesheet ${timesheet.id} for ${currentDayStr}:`, {
        sessions: timesheet.timesheet_sessions?.length || 0,
        main_start: timesheet.start_time,
        main_end: timesheet.end_time
      });

      // Se ci sono sessioni multiple, usa quelle
      if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
        const workSessions = timesheet.timesheet_sessions
          .filter(session => session.session_type === 'work')
          .sort((a, b) => a.session_order - b.session_order);

        console.log(`🔍 Processing ${workSessions.length} work sessions for timesheet ${timesheet.id}`);

        workSessions.forEach((session, sessionIndex) => {
          if (!session.start_time) return;

          // Per sessioni aperte, calcola end_time in tempo reale
          let sessionEndTime = session.end_time;
          if (!sessionEndTime) {
            const now = new Date();
            sessionEndTime = format(now, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
            console.log(`🔍 Session ${session.id} is ongoing, using current time: ${sessionEndTime}`);
          }

          const sessionStart = new Date(session.start_time);
          const sessionEnd = new Date(sessionEndTime);
          const sessionStartDate = format(sessionStart, 'yyyy-MM-dd');
          const sessionEndDate = format(sessionEnd, 'yyyy-MM-dd');

          console.log(`🔍 Session ${sessionIndex + 1}:`, {
            start: session.start_time,
            end: sessionEndTime,
            startDate: sessionStartDate,
            endDate: sessionEndDate,
            isMultiDay: sessionStartDate !== sessionEndDate
          });

          // Determina se la sessione appartiene a questo giorno
          const sessionBelongsToDay = sessionStartDate === currentDayStr || sessionEndDate === currentDayStr;
          
          if (!sessionBelongsToDay) {
            console.log(`🔍 Session ${sessionIndex + 1} doesn't belong to ${currentDayStr}, skipping`);
            return;
          }

          const startMinutes = timeToMinutes(session.start_time);
          const endMinutes = timeToMinutes(sessionEndTime);
          
          let actualStartMinutes: number;
          let actualEndMinutes: number;

          if (sessionStartDate !== currentDayStr && sessionEndDate === currentDayStr) {
            // Sessione iniziata il giorno prima, finisce oggi
            actualStartMinutes = 0; // Inizia a mezzanotte
            actualEndMinutes = endMinutes;
            console.log(`🔍 Session spans from previous day: 00:00 -> ${Math.floor(endMinutes/60)}:${(endMinutes%60).toString().padStart(2,'0')}`);
          } else if (sessionStartDate === currentDayStr && sessionEndDate !== currentDayStr) {
            // Sessione inizia oggi, continua domani
            actualStartMinutes = startMinutes;
            actualEndMinutes = 24 * 60; // Finisce a mezzanotte
            console.log(`🔍 Session spans to next day: ${Math.floor(startMinutes/60)}:${(startMinutes%60).toString().padStart(2,'0')} -> 24:00`);
          } else {
            // Sessione normale dello stesso giorno
            actualStartMinutes = startMinutes;
            actualEndMinutes = endMinutes;
            console.log(`🔍 Normal session: ${Math.floor(startMinutes/60)}:${(startMinutes%60).toString().padStart(2,'0')} -> ${Math.floor(endMinutes/60)}:${(endMinutes%60).toString().padStart(2,'0')}`);
          }

          // Crea blocco unico per questa sessione
          const blockId = `${timesheet.id}_s${sessionIndex + 1}`;
          console.log(`🔍 Creating block ${blockId} from ${actualStartMinutes} to ${actualEndMinutes} minutes`);
          
          blocks.push({
            timesheet: {
              ...timesheet,
              id: blockId, // ID univoco per questa sessione
              start_time: session.start_time,
              end_time: sessionEndTime
            },
            startMinutes: actualStartMinutes,
            endMinutes: actualEndMinutes,
            isLunchBreak: false,
            type: 'work',
            startDate: sessionStartDate,
            endDate: sessionEndDate
          });
        });
      } else {
        // Fallback per timesheet senza sessioni multiple (legacy)
        if (!timesheet.start_time || !timesheet.end_time) return;

        // Per timesheet in corso, calcola end_time in tempo reale
        let endTime = timesheet.end_time;
        if (!endTime && timesheet.start_time) {
          const now = new Date();
          endTime = format(now, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
          console.log(`🔍 Legacy timesheet ${timesheet.id} is ongoing, using current time: ${endTime}`);
        }

        const startMinutes = timeToMinutes(timesheet.start_time);
        const endMinutes = timeToMinutes(endTime);
        
        const timesheetStartDate = timesheet.date;
        const timesheetEndDate = timesheet.end_date || timesheet.date;
        
        // Determina se è una sessione multi-giorno
        const isMultiDaySession = timesheetEndDate !== timesheetStartDate;
        const isFromPreviousDay = timesheetStartDate !== currentDayStr && timesheetEndDate === currentDayStr;
        const isToNextDay = timesheetStartDate === currentDayStr && timesheetEndDate !== currentDayStr;
        
        let actualStartMinutes: number;
        let actualEndMinutes: number;

        if (isFromPreviousDay) {
          actualStartMinutes = 0;
          actualEndMinutes = endMinutes;
        } else if (isToNextDay) {
          actualStartMinutes = startMinutes;
          actualEndMinutes = 24 * 60;
        } else if (!isMultiDaySession && timesheetStartDate === currentDayStr) {
          // Timesheet normale dello stesso giorno
          actualStartMinutes = startMinutes;
          actualEndMinutes = endMinutes;
        } else {
          // FIX: Verifica più flessibile per timesheet del giorno corrente
          // Controlla se il timesheet appartiene a questo giorno considerando anche la data di inizio
          const timesheetDate = parseISO(timesheet.start_time || timesheet.date);
          const isCurrentDay = isSameDay(timesheetDate, dayDate);
          
          if (isCurrentDay) {
            // È del giorno corrente, processa normalmente
            actualStartMinutes = startMinutes;
            actualEndMinutes = endMinutes;
          } else {
            // Non è il giorno giusto per questo timesheet
            console.log(`🔍 [${currentDayStr}] Timesheet ${timesheet.id} skipped - belongs to different day`);
            return;
          }
        }

        // Crea un blocco singolo per il timesheet legacy
        blocks.push({
          timesheet,
          startMinutes: actualStartMinutes,
          endMinutes: actualEndMinutes,
          isLunchBreak: false,
          type: 'work',
          startDate: timesheetStartDate,
          endDate: timesheetEndDate
        });
      }
    });

    return blocks;
  };

  // Formatta orario per tooltip
  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    try {
      // Prima prova con parseISO per timestamp completi
      let time = parseISO(timeString);
      
      // Se la data è invalida, potrebbe essere solo un orario (HH:mm:ss)
      if (!isValid(time)) {
        // Prova a parsare come orario puro aggiungendo una data
        const timeOnly = timeString.match(/^(\d{2}):(\d{2}):?(\d{2})?$/);
        if (timeOnly) {
          return `${timeOnly[1]}:${timeOnly[2]}`;
        }
        // Fallback: prova con una data base
        time = parseISO(`2024-01-01T${timeString}`);
      }
      
      if (!isValid(time)) {
        return timeString; // Return original string as fallback
      }
      
      return format(time, 'HH:mm');
    } catch (error) {
      return timeString;
    }
  };

  // Controlla se ci sono assenze per il giorno
  const getAbsencesForDay = (day: Date) => {
    const currentDayStr = format(day, 'yyyy-MM-dd');
    return absences.filter(absence => absence.date === currentDayStr);
  };

  // Render absence block
  const renderAbsenceBlock = (absence: any, dayStr: string) => {
    let absenceIcon = CircleSlash;
    let absenceLabel = 'Assenza';
    let absenceClass = 'bg-muted/50 text-muted-foreground border-muted';

    if (absence.type === 'ferie') {
      absenceIcon = TreePalm;
      absenceLabel = 'Ferie';
      absenceClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
    } else if (absence.type === 'malattia') {
      absenceIcon = Stethoscope;
      absenceLabel = 'Malattia';
      absenceClass = 'bg-red-100 text-red-800 border-red-200';
    } else if (absence.type === 'permesso') {
      absenceIcon = AlertTriangle;
      absenceLabel = 'Permesso';
      absenceClass = 'bg-orange-100 text-orange-800 border-orange-200';
    }

    const Icon = absenceIcon;

    return (
      <div
        key={`absence-${absence.id}-${dayStr}`}
        className={cn(
          "border-2 border-dashed p-4 text-center rounded-lg",
          absenceClass
        )}
      >
        <Icon className="h-6 w-6 mx-auto mb-2" />
        <div className="text-sm font-medium">
          {absenceLabel}
        </div>
        {absence.notes && (
          <div className="text-xs mt-1 opacity-75">
            {absence.notes}
          </div>
        )}
      </div>
    );
  };

  // Get timesheet blocks for a specific day with session filtering
  const getTimesheetsForDay = (day: Date): TimesheetWithProfile[] => {
    const currentDayStr = format(day, 'yyyy-MM-dd');
    
    return realtimeTimesheets.filter(ts => {
      // Include: (1) TS che iniziano oggi, (2) TS che finiscono oggi (multi-giorno)
      const isStartDay = ts.date === currentDayStr;
      const isEndDay = ts.end_date === currentDayStr;
      const hasTimes = ts.start_time && (ts.end_time || !ts.end_time); // Include ongoing timesheets
      
      // Se ci sono sessioni multiple, controlla se una delle sessioni appartiene a questo giorno
      if (ts.timesheet_sessions && ts.timesheet_sessions.length > 0) {
        const hasSessionOnDay = ts.timesheet_sessions.some(session => {
          if (!session.start_time) return false;
          
          const sessionStart = new Date(session.start_time);
          const sessionStartDate = format(sessionStart, 'yyyy-MM-dd');
          
          // Per sessioni aperte, calcola data di fine
          let sessionEndDate = sessionStartDate;
          if (session.end_time) {
            const sessionEnd = new Date(session.end_time);
            sessionEndDate = format(sessionEnd, 'yyyy-MM-dd');
          }
          
          return sessionStartDate === currentDayStr || sessionEndDate === currentDayStr;
        });
        
        return hasSessionOnDay;
      }
      
      return hasTimes && (isStartDay || isEndDay);
    });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Timeline Container */}
        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-8 gap-4 h-full">
            {/* Time labels column */}
            <div className="col-span-1 relative">
              <div className="sticky top-0 bg-background z-10 pb-2">
                <div className="text-sm font-medium text-muted-foreground h-6 flex items-center">
                  Ore
                </div>
              </div>
              <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
                {timelineHours.map((hour, index) => (
                  <div
                    key={index}
                    className="absolute left-0 text-xs text-muted-foreground flex items-center"
                    style={{ top: index * HOUR_HEIGHT }}
                  >
                    <span className="text-right w-8">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                    {/* Midnight marker for multi-day sessions */}
                    {hour === 0 && DYNAMIC_START_HOUR !== 0 && (
                      <span className="ml-2 text-blue-500 font-medium">
                        (24:00)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Days columns */}
            {weekDays.map((day, dayIndex) => {
              const dayTimesheets = getTimesheetsForDay(day);
              const dayAbsences = getAbsencesForDay(day);
              const timeBlocks = calculateTimeBlocks(dayTimesheets, day);
              const dayStr = format(day, 'yyyy-MM-dd');

              return (
                <div key={dayIndex} className="col-span-1 relative">
                  {/* Day header */}
                  <div className="sticky top-0 bg-background z-10 pb-2">
                    <div className="text-sm font-medium text-center h-6 flex flex-col items-center justify-center">
                      <div className="capitalize">
                        {format(day, 'EEE', { locale: it })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(day, 'dd/MM')}
                      </div>
                    </div>
                  </div>

                  {/* Timeline column */}
                  <div className="relative border-l border-border/40" style={{ height: TIMELINE_HEIGHT }}>
                    {/* Hour grid lines */}
                    {timelineHours.map((_, index) => (
                      <div
                        key={index}
                        className="absolute left-0 right-0 border-t border-border/20"
                        style={{ top: index * HOUR_HEIGHT }}
                      />
                    ))}

                    {/* Absences */}
                    {dayAbsences.length > 0 && (
                      <div className="absolute inset-0 z-20 p-2 flex flex-col justify-center">
                        {dayAbsences.map(absence => renderAbsenceBlock(absence, dayStr))}
                      </div>
                    )}

                    {/* Time blocks */}
                    {timeBlocks.map((block, blockIndex) => {
                      const blockHeight = minutesToPosition(block.endMinutes) - minutesToPosition(block.startMinutes);
                      const blockTop = minutesToPosition(block.startMinutes);
                      
                      const workedHours = getTimesheetHours(block.timesheet);
                      const mealBenefits = getMealBenefits(block.timesheet);

                      return (
                        <Tooltip key={`${block.timesheet.id}-${blockIndex}`}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute left-1 right-1 rounded-md border cursor-pointer transition-all duration-200 hover:shadow-md z-10",
                                block.isLunchBreak 
                                  ? "bg-muted/50 border-muted text-muted-foreground" 
                                  : block.type === 'overtime'
                                  ? "bg-yellow-100 border-yellow-300 text-yellow-800"
                                  : block.type === 'night'
                                  ? "bg-blue-100 border-blue-300 text-blue-800"
                                  : "bg-green-100 border-green-300 text-green-800",
                                selectedTimesheet === block.timesheet.id ? "ring-2 ring-primary" : ""
                              )}
                              style={{
                                top: blockTop,
                                height: Math.max(blockHeight, 20)
                              }}
                              onClick={() => {
                                setSelectedTimesheet(
                                  selectedTimesheet === block.timesheet.id ? null : block.timesheet.id
                                );
                                onTimesheetClick?.(block.timesheet);
                              }}
                            >
                              <div className="p-1 flex flex-col h-full text-xs">
                                <div className="flex items-center gap-1 mb-1">
                                  {block.isLunchBreak ? (
                                    <Utensils className="h-3 w-3" />
                                  ) : block.type === 'overtime' ? (
                                    <Zap className="h-3 w-3" />
                                  ) : block.type === 'night' ? (
                                    <Moon className="h-3 w-3" />
                                  ) : (
                                    <Clock className="h-3 w-3" />
                                  )}
                                  <span className="text-xs font-medium truncate">
                                    {block.timesheet.profiles 
                                      ? `${block.timesheet.profiles.first_name} ${block.timesheet.profiles.last_name}`
                                      : 'N/A'
                                    }
                                  </span>
                                </div>
                                
                                <div className="text-xs">
                                  {formatTime(block.timesheet.start_time)} - {formatTime(block.timesheet.end_time) || 'In corso'}
                                </div>
                                
                                {/* Benefits indicators */}
                                <div className="flex gap-1 mt-1">
                                  {mealBenefits.mealVoucher && (
                                    <Badge variant="secondary" className="text-xs px-1 py-0">
                                      <Utensils className="h-2 w-2 mr-1" />
                                      MV
                                    </Badge>
                                  )}
                                  {mealBenefits.dailyAllowance && (
                                    <Badge variant="secondary" className="text-xs px-1 py-0">
                                      <Euro className="h-2 w-2 mr-1" />
                                      DA
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="space-y-2">
                              <div className="font-medium">
                                {block.timesheet.profiles 
                                  ? `${block.timesheet.profiles.first_name} ${block.timesheet.profiles.last_name}`
                                  : 'N/A'
                                }
                              </div>
                              <div className="text-sm">
                                <div>Inizio: {formatTime(block.timesheet.start_time)}</div>
                                <div>Fine: {formatTime(block.timesheet.end_time) || 'In corso'}</div>
                                <div>Ore lavorate: {workedHours.toFixed(2)}h</div>
                                {block.timesheet.overtime_hours && (
                                  <div>Straordinari: {block.timesheet.overtime_hours.toFixed(2)}h</div>
                                )}
                                {block.timesheet.night_hours && (
                                  <div>Ore notturne: {block.timesheet.night_hours.toFixed(2)}h</div>
                                )}
                              </div>
                              {block.timesheet.notes && (
                                <div className="text-sm text-muted-foreground">
                                  Note: {block.timesheet.notes}
                                </div>
                              )}
                              <div className="text-sm">
                                <div className="flex gap-2">
                                  <span className={mealBenefits.mealVoucher ? "text-green-600" : "text-muted-foreground"}>
                                    Buono pasto: {mealBenefits.mealVoucher ? "✓" : "✗"}
                                  </span>
                                  <span className={mealBenefits.dailyAllowance ? "text-green-600" : "text-muted-foreground"}>
                                    Diaria: {mealBenefits.dailyAllowance ? "✓" : "✗"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Legenda</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
                <span>Ore ordinarie</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                <span>Straordinari</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                <span>Ore notturne</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-muted/50 border border-muted border-dashed rounded"></div>
                <span>Pausa pranzo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}