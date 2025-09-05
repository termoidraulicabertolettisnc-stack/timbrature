import { useState } from 'react';
import { format, parseISO, eachHourOfInterval, addHours, startOfHour, isSameHour, differenceInMinutes, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimesheetWithProfile {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  night_hours: number | null;
  is_saturday: boolean;
  is_holiday: boolean;
  meal_voucher_earned: boolean;
  notes: string | null;
  user_id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  projects: {
    name: string;
  } | null;
}

interface TimesheetTimelineProps {
  timesheets: TimesheetWithProfile[];
  weekDays: Date[];
}

interface TimeBlock {
  timesheet: TimesheetWithProfile;
  startMinutes: number;
  endMinutes: number;
  isLunchBreak: boolean;
  type: 'work' | 'overtime' | 'night';
}

export function TimesheetTimeline({ timesheets, weekDays }: TimesheetTimelineProps) {
  const [selectedTimesheet, setSelectedTimesheet] = useState<string | null>(null);

  // Orari di riferimento (6:00 - 22:00)
  const START_HOUR = 6;
  const END_HOUR = 22;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 60; // pixels per hour
  const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

  // Genera le ore di riferimento
  const timelineHours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Converte minuti dal midnight in posizione Y
  const minutesToPosition = (minutes: number): number => {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    if (hour < START_HOUR) return 0;
    if (hour >= END_HOUR) return TIMELINE_HEIGHT;
    return ((hour - START_HOUR) * 60 + minute) * (HOUR_HEIGHT / 60);
  };

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

  // Calcola i blocchi temporali per ogni giorno
  const calculateTimeBlocks = (dayTimesheets: TimesheetWithProfile[]): TimeBlock[] => {
    // Remove duplicates based on ID 
    const uniqueTimesheets = dayTimesheets.filter((ts, index, arr) => 
      index === arr.findIndex(t => t.id === ts.id)
    );

    if (uniqueTimesheets.length === 0) return [];

    // Per ora gestiamo solo il primo timesheet del giorno
    // In un caso reale, dovremmo consolidare più timesheets dello stesso dipendente
    const timesheet = uniqueTimesheets[0];
    
    if (!timesheet.start_time || !timesheet.end_time) {
      return [];
    }

    const startMinutes = timeToMinutes(timesheet.start_time);
    const endMinutes = timeToMinutes(timesheet.end_time);
    const lunchStartMinutes = timesheet.lunch_start_time ? timeToMinutes(timesheet.lunch_start_time) : null;
    const lunchEndMinutes = timesheet.lunch_end_time ? timeToMinutes(timesheet.lunch_end_time) : null;

    const blocks: TimeBlock[] = [];
    const totalHours = timesheet.total_hours || 0;
    const overtimeHours = timesheet.overtime_hours || 0;
    const nightHours = timesheet.night_hours || 0;
    const regularHours = totalHours - overtimeHours;

    // Determina se tutto il lavoro è notturno
    const startHour = Math.floor(startMinutes / 60);
    const endHour = Math.floor(endMinutes / 60);
    const isFullyNightShift = nightHours > 0 && (startHour < 6 || endHour >= 22 || startHour >= 20);

    // Se è turno completamente notturno, tutto il blocco è notturno
    if (isFullyNightShift) {
      // Gestisci pausa pranzo se presente
      if (lunchStartMinutes && lunchEndMinutes && 
          lunchStartMinutes > startMinutes && lunchEndMinutes < endMinutes) {
        
        // Prima parte: dall'inizio alla pausa pranzo
        blocks.push({
          timesheet,
          startMinutes,
          endMinutes: lunchStartMinutes,
          isLunchBreak: false,
          type: 'night'
        });
        
        // Pausa pranzo
        blocks.push({
          timesheet,
          startMinutes: lunchStartMinutes,
          endMinutes: lunchEndMinutes,
          isLunchBreak: true,
          type: 'work'
        });
        
        // Seconda parte: dalla pausa pranzo alla fine
        blocks.push({
          timesheet,
          startMinutes: lunchEndMinutes,
          endMinutes,
          isLunchBreak: false,
          type: 'night'
        });
      } else {
        // Blocco continuo notturno
        blocks.push({
          timesheet,
          startMinutes,
          endMinutes,
          isLunchBreak: false,
          type: 'night'
        });
      }
    } else if (overtimeHours > 0 && totalHours > 8) {
      // Se ci sono straordinari, dividi il tempo tra ore ordinarie e straordinarie
      const totalWorkMinutes = endMinutes - startMinutes - (
        lunchStartMinutes && lunchEndMinutes ? (lunchEndMinutes - lunchStartMinutes) : 0
      );
      const regularMinutes = Math.round((regularHours / totalHours) * totalWorkMinutes);
      const overtimeStartMinutes = startMinutes + regularMinutes + (
        lunchStartMinutes && lunchEndMinutes ? (lunchEndMinutes - lunchStartMinutes) : 0
      );

      // Gestisci pausa pranzo se presente
      if (lunchStartMinutes && lunchEndMinutes && 
          lunchStartMinutes > startMinutes && lunchEndMinutes < endMinutes) {
        
        if (lunchStartMinutes < overtimeStartMinutes) {
          // La pausa pranzo è durante le ore ordinarie
          // Ore ordinarie prima della pausa
          blocks.push({
            timesheet,
            startMinutes,
            endMinutes: lunchStartMinutes,
            isLunchBreak: false,
            type: 'work'
          });
          
          // Pausa pranzo
          blocks.push({
            timesheet,
            startMinutes: lunchStartMinutes,
            endMinutes: lunchEndMinutes,
            isLunchBreak: true,
            type: 'work'
          });
          
          // Determina se ci sono ancora ore ordinarie dopo la pausa
          if (lunchEndMinutes < overtimeStartMinutes) {
            // Ore ordinarie dopo la pausa
            blocks.push({
              timesheet,
              startMinutes: lunchEndMinutes,
              endMinutes: overtimeStartMinutes,
              isLunchBreak: false,
              type: 'work'
            });
            
            // Ore straordinarie
            blocks.push({
              timesheet,
              startMinutes: overtimeStartMinutes,
              endMinutes,
              isLunchBreak: false,
              type: 'overtime'
            });
          } else {
            // Straordinari iniziano subito dopo la pausa
            blocks.push({
              timesheet,
              startMinutes: lunchEndMinutes,
              endMinutes,
              isLunchBreak: false,
              type: 'overtime'
            });
          }
        } else {
          // La pausa pranzo è durante le ore straordinarie
          // Ore ordinarie
          blocks.push({
            timesheet,
            startMinutes,
            endMinutes: overtimeStartMinutes,
            isLunchBreak: false,
            type: 'work'
          });
          
          // Straordinari prima della pausa
          blocks.push({
            timesheet,
            startMinutes: overtimeStartMinutes,
            endMinutes: lunchStartMinutes,
            isLunchBreak: false,
            type: 'overtime'
          });
          
          // Pausa pranzo
          blocks.push({
            timesheet,
            startMinutes: lunchStartMinutes,
            endMinutes: lunchEndMinutes,
            isLunchBreak: true,
            type: 'work'
          });
          
          // Straordinari dopo la pausa
          blocks.push({
            timesheet,
            startMinutes: lunchEndMinutes,
            endMinutes,
            isLunchBreak: false,
            type: 'overtime'
          });
        }
      } else {
        // Nessuna pausa pranzo specifica
        // Ore ordinarie
        blocks.push({
          timesheet,
          startMinutes,
          endMinutes: overtimeStartMinutes,
          isLunchBreak: false,
          type: 'work'
        });
        
        // Ore straordinarie
        blocks.push({
          timesheet,
          startMinutes: overtimeStartMinutes,
          endMinutes,
          isLunchBreak: false,
          type: 'overtime'
        });
      }
    } else {
      // Nessun straordinario, tutto è lavoro normale
      if (lunchStartMinutes && lunchEndMinutes && 
          lunchStartMinutes > startMinutes && lunchEndMinutes < endMinutes) {
        
        // Prima parte: dall'inizio alla pausa pranzo
        blocks.push({
          timesheet,
          startMinutes,
          endMinutes: lunchStartMinutes,
          isLunchBreak: false,
          type: 'work'
        });
        
        // Pausa pranzo
        blocks.push({
          timesheet,
          startMinutes: lunchStartMinutes,
          endMinutes: lunchEndMinutes,
          isLunchBreak: true,
          type: 'work'
        });
        
        // Seconda parte: dalla pausa pranzo alla fine
        blocks.push({
          timesheet,
          startMinutes: lunchEndMinutes,
          endMinutes,
          isLunchBreak: false,
          type: 'work'
        });
      } else {
        // Blocco continuo senza pausa pranzo
        blocks.push({
          timesheet,
          startMinutes,
          endMinutes,
          isLunchBreak: false,
          type: 'work'
        });
      }
    }

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
      console.warn('Error formatting time:', timeString, error);
      return timeString; // Return original string as fallback
    }
  };

  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };

  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeline Settimanale
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 overflow-x-auto">
          {/* Colonna degli orari */}
          <div className="flex-shrink-0 w-16">
            <div className="h-8 mb-2" /> {/* Spazio per header giorni */}
            <div className="relative" style={{ height: TIMELINE_HEIGHT }}>
              {timelineHours.map(hour => (
                <div
                  key={hour}
                  className="absolute left-0 text-sm text-muted-foreground font-medium"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT - 8 }}
                >
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Colonne per ogni giorno */}
          {weekDays.map((day, dayIndex) => {
            const dayTimesheets = timesheets.filter(ts => ts.date === format(day, 'yyyy-MM-dd'));
            const timeBlocks = calculateTimeBlocks(dayTimesheets);
            
            return (
              <div key={day.toISOString()} className="flex-1 min-w-[120px]">
                {/* Header giorno */}
                <div className="h-8 mb-2 text-center">
                  <div className="text-sm font-medium">{dayNames[dayIndex]}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(day, 'dd/MM')}
                  </div>
                </div>

                {/* Timeline giorno */}
                <div className="relative bg-secondary/20 border border-border rounded-lg" style={{ height: TIMELINE_HEIGHT }}>
                  {/* Griglia ore */}
                  {timelineHours.slice(0, -1).map(hour => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-border/30"
                      style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Blocchi temporali */}
                  <TooltipProvider>
                    {timeBlocks.map((block, blockIndex) => {
                      const top = minutesToPosition(block.startMinutes);
                      const height = minutesToPosition(block.endMinutes) - top;
                      
                      if (height <= 0) return null;

                      return (
                        <Tooltip key={blockIndex}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute rounded cursor-pointer transition-all hover:scale-105 hover:z-10 border",
                                "left-2 right-2", // Full width with small margins
                                {
                                  // Ore ordinarie - usa colori semantici
                                  "bg-timeline-work border-timeline-work text-timeline-work-foreground hover:bg-timeline-work/90": 
                                    block.type === 'work' && !block.isLunchBreak,
                                  // Straordinari - usa colori semantici
                                  "bg-timeline-overtime border-timeline-overtime text-timeline-overtime-foreground hover:bg-timeline-overtime/90": 
                                    block.type === 'overtime' && !block.isLunchBreak,
                                  // Ore notturne - usa colori semantici
                                  "bg-timeline-night border-timeline-night text-timeline-night-foreground hover:bg-timeline-night/90": 
                                    block.type === 'night' && !block.isLunchBreak,
                                  // Pausa pranzo - usa colori semantici
                                  "bg-timeline-lunch border-timeline-lunch text-timeline-lunch-foreground hover:bg-timeline-lunch/80": 
                                    block.isLunchBreak,
                                  // Evidenziato se selezionato
                                  "ring-2 ring-ring scale-105": 
                                    selectedTimesheet === block.timesheet.id
                                }
                              )}
                              style={{
                                top,
                                height: Math.max(height, 4),
                                minHeight: '4px'
                              }}
                              onClick={() => setSelectedTimesheet(
                                selectedTimesheet === block.timesheet.id ? null : block.timesheet.id
                              )}
                            >
                              {height >= 20 && !block.isLunchBreak && (
                                <div className="p-1 text-xs font-medium truncate">
                                  {block.timesheet.projects?.name || 'Lavoro'}
                                </div>
                              )}
                              {block.isLunchBreak && height >= 16 && (
                                <div className="p-1 text-xs text-center">
                                  🍽️
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="space-y-1">
                              <div className="font-semibold">
                                {block.isLunchBreak ? 'Pausa Pranzo' : (block.timesheet.projects?.name || 'Lavoro')}
                              </div>
                              <div className="text-sm">
                                {formatTime(block.timesheet.start_time)} - {formatTime(block.timesheet.end_time)}
                              </div>
                              {!block.isLunchBreak && (
                                <div className="text-sm space-y-1">
                                  <div>Ore totali: {formatHours(block.timesheet.total_hours)}</div>
                                  {block.timesheet.overtime_hours && block.timesheet.overtime_hours > 0 && (
                                    <div>Straordinari: {formatHours(block.timesheet.overtime_hours)}</div>
                                  )}
                                  {block.timesheet.night_hours && block.timesheet.night_hours > 0 && (
                                    <div>Notturno: {formatHours(block.timesheet.night_hours)}</div>
                                  )}
                                  <div className="flex gap-1 flex-wrap">
                                    {block.timesheet.is_saturday && <Badge variant="secondary" className="text-xs">Sab</Badge>}
                                    {block.timesheet.is_holiday && <Badge variant="secondary" className="text-xs">Fest</Badge>}
                                    {block.timesheet.meal_voucher_earned && <Badge variant="default" className="text-xs">Buono</Badge>}
                                  </div>
                                </div>
                              )}
                              {block.timesheet.notes && (
                                <div className="text-sm text-muted-foreground">
                                  Note: {block.timesheet.notes}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </TooltipProvider>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-timeline-work border border-timeline-work rounded"></div>
            <span>Ore ordinarie</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-timeline-overtime border border-timeline-overtime rounded"></div>
            <span>Straordinari</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-timeline-night border border-timeline-night rounded"></div>
            <span>Ore notturne</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-timeline-lunch border border-timeline-lunch rounded"></div>
            <span>Pausa pranzo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}