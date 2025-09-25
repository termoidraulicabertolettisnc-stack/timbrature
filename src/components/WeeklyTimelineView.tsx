import React, { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Edit, Trash2, UtensilsCrossed, Clock, Plus } from 'lucide-react';
import { TimesheetWithProfile } from '@/types/timesheet';
import { BenefitsService } from '@/services/BenefitsService';
import { useWeeklyRealtimeHours } from '@/hooks/use-weekly-realtime-hours';
import { AbsenceIndicator } from '@/components/AbsenceIndicator';
import { sessionsForDay, utcToLocal } from '@/utils/timeSegments';

interface WeeklyTimelineViewProps {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  employeeSettings: any;
  companySettings: any;
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
  onAddTimesheet: (date: string, userId: string) => void;
  onAddAbsence: (date: string, userId: string) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
}

interface TimelineEntry {
  timesheet: TimesheetWithProfile;
  start_time: string;
  end_time: string | null;
  duration: number;
  regular_duration: number;
  overtime_duration: number;
  position: number;
  width: number;
  mealVoucher: boolean;
  isActive: boolean;
}

interface DayTimeline {
  date: string;
  entries: TimelineEntry[];
  absences: any[];
}

interface EmployeeWeekData {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  days: DayTimeline[];
  totals: {
    total_hours: number;
    overtime_hours: number;
    night_hours: number;
  };
}

export function WeeklyTimelineView({
  timesheets,
  absences,
  dateFilter,
  employeeSettings,
  companySettings,
  onEditTimesheet,
  onDeleteTimesheet,
  onAddTimesheet,
  onAddAbsence,
  onNavigatePrevious,
  onNavigateNext,
  onNavigateToday
}: WeeklyTimelineViewProps) {
  const baseDate = parseISO(dateFilter);
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const employeeData = useMemo(() => {
    console.log('🔍 WeeklyTimelineView - Processing data:', {
      timesheets_count: timesheets.length,
      absences_count: absences.length,
      dateFilter,
      sample_timesheet: timesheets[0],
      sample_absence: absences[0]
    });
    
    console.log('🔍 WeeklyTimelineView - All absences:', absences);
    
    const employeesMap = new Map<string, EmployeeWeekData>();

    // Inizializza i dipendenti dai timesheet
    timesheets.forEach(timesheet => {
      if (!timesheet.profiles) return;

      const key = timesheet.user_id;
      if (!employeesMap.has(key)) {
        const weekDayTimelines = weekDays.map(day => ({
          date: format(day, 'yyyy-MM-dd'),
          entries: [],
          absences: []
        }));

        employeesMap.set(key, {
          user_id: timesheet.user_id,
          first_name: timesheet.profiles.first_name,
          last_name: timesheet.profiles.last_name,
          email: timesheet.profiles.email,
          days: weekDayTimelines,
          totals: { total_hours: 0, overtime_hours: 0, night_hours: 0 }
        });
      }
    });

    // Aggiungi le assenze
    console.log('🔍 WeeklyTimelineView - Adding absences, count:', absences.length);
    absences.forEach((absence, index) => {
      console.log(`🔍 WeeklyTimelineView - Processing absence ${index}:`, absence);
      
      if (!absence.profiles) {
        console.log('🔍 WeeklyTimelineView - No profiles in absence, skipping');
        return;
      }

      const employeeId = absence.user_id;
      let employee = employeesMap.get(employeeId);
      
      console.log('🔍 WeeklyTimelineView - Employee found:', !!employee, 'for user_id:', employeeId);
      
      if (!employee && absence.profiles) {
        // Crea il dipendente se non esiste
        const weekDayTimelines = weekDays.map(day => ({
          date: format(day, 'yyyy-MM-dd'),
          entries: [],
          absences: []
        }));

        employee = {
          user_id: absence.user_id,
          first_name: absence.profiles.first_name,
          last_name: absence.profiles.last_name,
          email: absence.profiles.email,
          days: weekDayTimelines,
          totals: { total_hours: 0, overtime_hours: 0, night_hours: 0 }
        };
        employeesMap.set(employeeId, employee);
      }

      if (employee) {
        const dayIndex = employee.days.findIndex(day => day.date === absence.date);
        if (dayIndex !== -1) {
          console.log('🔍 WeeklyTimelineView - Adding absence to day:', dayIndex, 'absence:', absence);
          employee.days[dayIndex].absences.push(absence);
        } else {
          console.log('🔍 WeeklyTimelineView - Day not found for absence date:', absence.date);
        }
      }
    });

    // Process timesheets using the new utility functions
    const processTimesheet = (timesheet: TimesheetWithProfile, employee: EmployeeWeekData) => {
      weekDays.forEach((day, dayIndex) => {
        const dayISO = format(day, 'yyyy-MM-dd');
        const segments = sessionsForDay(timesheet, dayISO);
        
        if (segments.length === 0) return;

        segments.forEach((segment, segmentIndex) => {
          const localStart = utcToLocal(segment.startUtc);
          const localEnd = utcToLocal(segment.endUtc);
          const sessionDuration = (localEnd.getTime() - localStart.getTime()) / (1000 * 60 * 60);
          
          if (sessionDuration <= 0) return;

          // Calculate meal benefits only for the first segment of each day
          let mealBenefits = { mealVoucher: false };
          if (segmentIndex === 0) {
            const employeeSetting = employeeSettings[timesheet.user_id];
            BenefitsService.validateTemporalUsage('WeeklyTimelineView');
            mealBenefits = BenefitsService.calculateMealBenefitsSync(
              timesheet,
              employeeSetting,
              companySettings
            );
          }

          const sessionRegularHours = Math.min(sessionDuration, 8);
          const sessionOvertimeHours = Math.max(0, sessionDuration - 8);
          
          const startHour = localStart.getHours() + localStart.getMinutes() / 60;
          const endHour = localEnd.getHours() + localEnd.getMinutes() / 60;
          const position = (startHour / 24) * 100;
          const width = ((endHour - startHour) / 24) * 100;

          const entry: TimelineEntry = {
            timesheet: { ...timesheet, id: `${timesheet.id}_${segment.sessionId || 'legacy'}_${segmentIndex}` },
            start_time: format(localStart, 'HH:mm:ss'),
            end_time: format(localEnd, 'HH:mm:ss'),
            duration: sessionDuration,
            regular_duration: sessionRegularHours,
            overtime_duration: sessionOvertimeHours,
            position,
            width,
            mealVoucher: mealBenefits.mealVoucher,
            isActive: !segment.sessionId || segment.sessionId.includes('ongoing')
          };

          employee.days[dayIndex].entries.push(entry);
          
          // Update totals only once per segment
          if (segmentIndex === 0) {
            employee.totals.total_hours += sessionDuration;
            employee.totals.overtime_hours += sessionOvertimeHours;
            employee.totals.night_hours += (timesheet.night_hours || 0) * (sessionDuration / (timesheet.total_hours || sessionDuration));
          }
        });
      });
    };

    // Process timesheets for each employee
    timesheets.forEach(timesheet => {
      const employee = employeesMap.get(timesheet.user_id);
      if (!employee) return;

      processTimesheet(timesheet, employee);
    });

    const result = Array.from(employeesMap.values());
    console.log('📊 WeeklyTimelineView - Final result:', {
      employees_count: result.length,
      employees: result.map(emp => ({ 
        name: `${emp.first_name} ${emp.last_name}`, 
        days_with_entries: emp.days.filter(d => d.entries.length > 0).length,
        total_hours: emp.totals.total_hours 
      }))
    });
    
    return result;
  }, [timesheets, absences, dateFilter, employeeSettings, companySettings]);

  // Usa hook per aggiornamenti real-time
  const realtimeData = useWeeklyRealtimeHours(timesheets);

  const renderTimelineEntryFixed = (entry: TimelineEntry) => {
    const regularWidth = (entry.regular_duration / entry.duration) * entry.width;
    const overtimeWidth = (entry.overtime_duration / entry.duration) * entry.width;
    
    // Determina se è una sessione specifica o timesheet principale
    const isSpecificSession = (entry.timesheet as any).session_id !== undefined;
    const originalId = (entry.timesheet as any).original_timesheet_id || entry.timesheet.id.split('_')[0];
    
    console.log('🔧 WEEKLY SESSION FIX - Rendering entry:', {
      entry_id: entry.timesheet.id,
      original_id: originalId,
      is_specific_session: isSpecificSession,
      session_id: (entry.timesheet as any).session_id,
      session_order: (entry.timesheet as any).session_order,
      start_time: entry.timesheet.start_time,
      end_time: entry.timesheet.end_time
    });

    // CORREZIONE: Crea un oggetto timesheet con i dati della sessione specifica
    const handleEditClick = () => {
      if (isSpecificSession) {
        // Per sessioni specifiche, crea un timesheet temporaneo con i dati della sessione
        const sessionBasedTimesheet = {
          ...entry.timesheet,
          id: originalId, // Usa l'ID originale per il database
          start_time: entry.timesheet.start_time, // Orari della sessione specifica
          end_time: entry.timesheet.end_time,     // Orari della sessione specifica
          total_hours: entry.timesheet.total_hours, // Ore della sessione specifica
          // Mantieni tutti gli altri dati dal timesheet originale
          date: entry.timesheet.date,
          project_id: entry.timesheet.project_id,
          notes: (entry.timesheet as any).session_notes || entry.timesheet.notes,
          // Aggiungi flag per identificare che stiamo modificando una sessione specifica
          _editing_session_id: (entry.timesheet as any).session_id,
          _editing_session_order: (entry.timesheet as any).session_order
        };
        
        console.log('🔧 WEEKLY SESSION FIX - Editing specific session:', sessionBasedTimesheet);
        onEditTimesheet(sessionBasedTimesheet);
      } else {
        // Per timesheet principali, usa l'approccio normale
        console.log('🔧 WEEKLY SESSION FIX - Editing main timesheet:', originalId);
        onEditTimesheet({ ...entry.timesheet, id: originalId });
      }
    };
    
    return (
      <div
        key={entry.timesheet.id}
        className="absolute flex h-6 z-10 group"
        style={{ left: `${entry.position}%`, width: `${entry.width}%` }}
      >
        {/* Fascia orario normale */}
        {entry.regular_duration > 0 && (
          <div
            className={`h-full bg-primary rounded-l-sm 
              ${entry.overtime_duration === 0 ? 'rounded-r-sm' : ''} 
              ${entry.isActive ? 'animate-pulse' : ''} 
              cursor-pointer hover:opacity-80 transition-all
              flex items-center justify-between px-2 text-white text-xs
              ${isSpecificSession ? 'border-2 border-purple-400' : ''}`}
            style={{ width: `${(regularWidth / entry.width) * 100}%` }}
            onClick={handleEditClick}
            title={`${isSpecificSession ? `Sessione ${(entry.timesheet as any).session_order || 1}` : 'Timesheet'} - ${entry.start_time} - ${entry.end_time || 'in corso'}`}
          >
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{entry.regular_duration.toFixed(1)}h</span>
              {(entry.timesheet as any).session_order && (
                <span className="text-xs">#{(entry.timesheet as any).session_order}</span>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              {entry.mealVoucher && <UtensilsCrossed className="h-3 w-3" />}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-white hover:text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick();
                  }}
                >
                  <Edit className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-white hover:text-red-200 hover:bg-red-500/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('🔧 WEEKLY SESSION FIX - Delete button clicked:', originalId);
                    onDeleteTimesheet(originalId);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {/* Fascia straordinari */}
        {entry.overtime_duration > 0 && (
          <div
            className={`h-full bg-orange-500 rounded-r-sm 
              ${entry.isActive ? 'animate-pulse' : ''} 
              cursor-pointer hover:opacity-80 transition-all
              flex items-center justify-center text-white text-xs font-medium`}
            style={{ width: `${(overtimeWidth / entry.width) * 100}%` }}
            onClick={handleEditClick}
            title={`Straordinari: ${entry.overtime_duration.toFixed(1)}h`}
          >
            +{entry.overtime_duration.toFixed(1)}h
          </div>
        )}
      </div>
    );
  };

  const timeMarkers = Array.from({ length: 25 }, (_, i) => i);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vista Settimanale Timeline
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onNavigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onNavigateToday}>
              Oggi
            </Button>
            <Button variant="outline" size="sm" onClick={onNavigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <CardDescription>
          {format(weekStart, 'dd MMM', { locale: it })} - {format(weekEnd, 'dd MMM yyyy', { locale: it })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {employeeData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun timesheet trovato per questa settimana
          </div>
        ) : (
          <div className="space-y-8">
            {employeeData.map(employee => (
              <Card key={employee.user_id} className="border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {employee.first_name} {employee.last_name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{employee.email}</p>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium">
                        Totale: {isNaN(employee.totals.total_hours) ? '0.0' : employee.totals.total_hours.toFixed(1)}h
                      </span>
                      {employee.totals.overtime_hours > 0 && !isNaN(employee.totals.overtime_hours) && (
                        <span className="text-orange-600">
                          Straord: {employee.totals.overtime_hours.toFixed(1)}h
                        </span>
                      )}
                      {employee.totals.night_hours > 0 && !isNaN(employee.totals.night_hours) && (
                        <span className="text-blue-600">
                          Notte: {employee.totals.night_hours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Time markers header */}
                    <div className="relative h-6 border-b">
                      <div className="absolute inset-0 flex">
                        {timeMarkers.map(hour => (
                          <div
                            key={hour}
                            className="flex-1 text-xs text-muted-foreground border-r border-muted-foreground/20 pl-1"
                            style={{ width: '4.166%' }}
                          >
                            {hour < 24 && hour % 4 === 0 && `${hour}:00`}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Days timeline */}
                    {employee.days.map(day => (
                      <div key={day.date} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium min-w-[100px]">
                            {format(parseISO(day.date), 'EEE dd/MM', { locale: it })}
                          </h4>
                          
                          {/* Absences */}
                          <div className="flex gap-1">
                            <AbsenceIndicator absences={day.absences} />
                          </div>
                          
                          {/* Pulsanti per aggiungere timbrature/assenze */}
                          <div className="flex gap-1 ml-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => onAddTimesheet(day.date, employee.user_id)}
                              title="Aggiungi timbratura"
                            >
                              <Clock className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => onAddAbsence(day.date, employee.user_id)}
                              title="Aggiungi assenza"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="relative h-8 bg-muted/30 rounded">
                          {/* Hour grid lines */}
                          <div className="absolute inset-0 flex">
                            {timeMarkers.slice(0, 24).map(hour => (
                              <div
                                key={hour}
                                className="border-r border-muted-foreground/10 h-full"
                                style={{ width: '4.166%' }}
                              />
                            ))}
                          </div>

                          {/* Timeline entries */}
                          {day.entries.map(renderTimelineEntryFixed)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}