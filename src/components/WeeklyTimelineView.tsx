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

    // Utility per dividere turni notturni
    const splitNightShift = (timesheet: TimesheetWithProfile, employee: EmployeeWeekData) => {
      // Se abbiamo sessioni multiple, calcoliamo da quelle
      if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
        const workSessions = timesheet.timesheet_sessions
          .filter(session => session.session_type === 'work')
          .sort((a, b) => a.session_order - b.session_order);
        
        // Itera ogni sessione individualmente per gestire splits e ID univoci
        workSessions.forEach((session, sessionIndex) => {
          if (!session.start_time) return;
          
          const sessionStart = new Date(session.start_time);
          const sessionEnd = session.end_time ? new Date(session.end_time) : new Date();
          const sessionDuration = (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60 * 60);
          
          if (sessionDuration <= 0) return;
          
          // Controlla se la sessione attraversa la mezzanotte
          const startDate = format(sessionStart, 'yyyy-MM-dd');
          const endDate = format(sessionEnd, 'yyyy-MM-dd');
          const isNightShift = startDate !== endDate;
          
          // Calcola meal voucher solo per la prima sessione del giorno
          const employeeSetting = employeeSettings[timesheet.user_id];
          BenefitsService.validateTemporalUsage('WeeklyTimelineView');
          const mealBenefits = sessionIndex === 0 ? BenefitsService.calculateMealBenefitsSync(
            timesheet,
            employeeSetting,
            companySettings
          ) : { mealVoucher: false };
          
          // Calcola ore regolari e straordinari per questa sessione
          const sessionRegularHours = Math.min(sessionDuration, 8);
          const sessionOvertimeHours = Math.max(0, sessionDuration - 8);
          
          if (!isNightShift) {
            // Sessione normale - stesso giorno
            const dayIndex = employee.days.findIndex(day => day.date === startDate);
            if (dayIndex === -1) return;

            const day = employee.days[dayIndex];
            const startHourUTC = sessionStart.getUTCHours() + sessionStart.getUTCMinutes() / 60 + 1;
            const startHour = startHourUTC >= 24 ? startHourUTC - 24 : (startHourUTC < 0 ? startHourUTC + 24 : startHourUTC);
            const endHour = Math.min(24, startHour + sessionDuration);
            const position = (startHour / 24) * 100;
            const width = ((endHour - startHour) / 24) * 100;

            const entry: TimelineEntry = {
              timesheet: { ...timesheet, id: `${timesheet.id}_s${sessionIndex}` },
              start_time: format(sessionStart, 'HH:mm:ss'),
              end_time: session.end_time ? format(sessionEnd, 'HH:mm:ss') : null,
              duration: sessionDuration,
              regular_duration: sessionRegularHours,
              overtime_duration: sessionOvertimeHours,
              position,
              width,
              mealVoucher: mealBenefits.mealVoucher,
              isActive: !session.end_time
            };

            day.entries.push(entry);
          } else {
            // Sessione notturna - split across days
            const startHourUTC = sessionStart.getUTCHours() + sessionStart.getUTCMinutes() / 60 + 1;
            const endHourUTC = sessionEnd.getUTCHours() + sessionEnd.getUTCMinutes() / 60 + 1;
            const startHour = startHourUTC >= 24 ? startHourUTC - 24 : (startHourUTC < 0 ? startHourUTC + 24 : startHourUTC);
            const endHour = endHourUTC >= 24 ? endHourUTC - 24 : (endHourUTC < 0 ? endHourUTC + 24 : endHourUTC);
            
            // Prima parte: dal tempo di inizio fino a mezzanotte
            const firstDayIndex = employee.days.findIndex(day => day.date === startDate);
            if (firstDayIndex !== -1) {
              const firstDayDuration = 24 - startHour;
              const firstDayRegular = Math.min(firstDayDuration, 8);
              const firstDayOvertime = Math.max(0, firstDayDuration - 8);
              
              const firstEntry: TimelineEntry = {
                timesheet: { ...timesheet, id: `${timesheet.id}_s${sessionIndex}_p1` },
                start_time: format(sessionStart, 'HH:mm:ss'),
                end_time: '24:00:00',
                duration: firstDayDuration,
                regular_duration: firstDayRegular,
                overtime_duration: firstDayOvertime,
                position: (startHour / 24) * 100,
                width: ((24 - startHour) / 24) * 100,
                mealVoucher: mealBenefits.mealVoucher,
                isActive: !session.end_time
              };

              employee.days[firstDayIndex].entries.push(firstEntry);
            }

            // Seconda parte: da mezzanotte al tempo di fine
            const secondDayIndex = employee.days.findIndex(day => day.date === endDate);
            if (secondDayIndex !== -1) {
              const secondDayDuration = endHour;
              const remainingRegular = Math.max(0, Math.min(8 - (24 - startHour), secondDayDuration));
              const secondDayRegular = Math.max(0, remainingRegular);
              const secondDayOvertime = Math.max(0, secondDayDuration - secondDayRegular);
              
              const secondEntry: TimelineEntry = {
                timesheet: { ...timesheet, id: `${timesheet.id}_s${sessionIndex}_p2` },
                start_time: '00:00:00',
                end_time: session.end_time ? format(sessionEnd, 'HH:mm:ss') : null,
                duration: secondDayDuration,
                regular_duration: secondDayRegular,
                overtime_duration: secondDayOvertime,
                position: 0,
                width: (endHour / 24) * 100,
                mealVoucher: false, // Solo la prima parte ha il buono pasto
                isActive: !session.end_time
              };

              employee.days[secondDayIndex].entries.push(secondEntry);
            }
          }
          
          // Aggiorna i totali dell'employee (una volta per sessione)
          employee.totals.total_hours += sessionDuration;
          employee.totals.overtime_hours += sessionOvertimeHours;
          employee.totals.night_hours += (timesheet.night_hours || 0) / workSessions.length; // Distribuisci uniformemente
        });
        
        return;
      }

      // Logica originale per timesheet senza sessioni
      if (!timesheet.start_time) return;

      const startTime = new Date(timesheet.start_time);
      let endTime: Date;
      let isActive = false;

      if (timesheet.end_time) {
        endTime = new Date(timesheet.end_time);
      } else {
        endTime = new Date();
        isActive = true;
      }

      const totalDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      if (isNaN(totalDuration) || totalDuration < 0) return;

      // Controlla se il turno attraversa la mezzanotte
      const startDate = format(startTime, 'yyyy-MM-dd');
      const endDate = format(endTime, 'yyyy-MM-dd');
      const isNightShift = startDate !== endDate || timesheet.night_hours > 0;

      // Calcola meal voucher una sola volta
      const employeeSetting = employeeSettings[timesheet.user_id];
      BenefitsService.validateTemporalUsage('WeeklyTimelineView');
      const mealBenefits = BenefitsService.calculateMealBenefitsSync(
        timesheet,
        employeeSetting,
        companySettings
      );

      if (!isNightShift) {
        // Turno normale - processa come prima
        const dayIndex = employee.days.findIndex(day => day.date === timesheet.date);
        if (dayIndex === -1) return;

        const day = employee.days[dayIndex];
        const startHourUTC = startTime.getUTCHours() + startTime.getUTCMinutes() / 60 + 1; // Convert to Europe/Rome
        const startHour = startHourUTC >= 24 ? startHourUTC - 24 : (startHourUTC < 0 ? startHourUTC + 24 : startHourUTC);
        const endHour = Math.min(24, startHour + totalDuration);
        const position = (startHour / 24) * 100;
        const width = ((endHour - startHour) / 24) * 100;

        const regularHours = Math.min(totalDuration, 8);
        const overtimeHours = Math.max(0, totalDuration - 8);

        const entry: TimelineEntry = {
          timesheet,
          start_time: format(startTime, 'HH:mm:ss'),
          end_time: timesheet.end_time ? format(endTime, 'HH:mm:ss') : null,
          duration: totalDuration,
          regular_duration: regularHours,
          overtime_duration: overtimeHours,
          position,
          width,
          mealVoucher: mealBenefits.mealVoucher,
          isActive
        };

        day.entries.push(entry);
      } else {
        // Turno notturno - dividi in due parti - usando UTC+1 (Europa/Roma)
        const startHourUTC = startTime.getUTCHours() + startTime.getUTCMinutes() / 60 + 1; // Convert to Europe/Rome
        const endHourUTC = endTime.getUTCHours() + endTime.getUTCMinutes() / 60 + 1; // Convert to Europe/Rome
        const startHour = startHourUTC >= 24 ? startHourUTC - 24 : (startHourUTC < 0 ? startHourUTC + 24 : startHourUTC);
        const endHour = endHourUTC >= 24 ? endHourUTC - 24 : (endHourUTC < 0 ? endHourUTC + 24 : endHourUTC);
        
        // Prima parte: dal tempo di inizio fino a mezzanotte
        const firstDayIndex = employee.days.findIndex(day => day.date === startDate);
        if (firstDayIndex !== -1) {
          const firstDayDuration = 24 - startHour;
          const firstDayRegular = Math.min(firstDayDuration, 8);
          const firstDayOvertime = Math.max(0, firstDayDuration - 8);
          
          const firstEntry: TimelineEntry = {
            timesheet: { ...timesheet, id: `${timesheet.id}_part1` },
            start_time: format(startTime, 'HH:mm:ss'),
            end_time: '24:00:00',
            duration: firstDayDuration,
            regular_duration: firstDayRegular,
            overtime_duration: firstDayOvertime,
            position: (startHour / 24) * 100,
            width: ((24 - startHour) / 24) * 100,
            mealVoucher: mealBenefits.mealVoucher,
            isActive: isActive && !timesheet.end_time
          };

          employee.days[firstDayIndex].entries.push(firstEntry);
        }

        // Seconda parte: da mezzanotte al tempo di fine
        const secondDayIndex = employee.days.findIndex(day => day.date === endDate);
        if (secondDayIndex !== -1) {
          const secondDayDuration = endHour;
          const remainingRegular = Math.max(0, Math.min(8 - (24 - startHour), secondDayDuration));
          const secondDayRegular = Math.max(0, remainingRegular);
          const secondDayOvertime = Math.max(0, secondDayDuration - secondDayRegular);
          
          const secondEntry: TimelineEntry = {
            timesheet: { ...timesheet, id: `${timesheet.id}_part2` },
            start_time: '00:00:00',
            end_time: timesheet.end_time ? format(endTime, 'HH:mm:ss') : null,
            duration: secondDayDuration,
            regular_duration: secondDayRegular,
            overtime_duration: secondDayOvertime,
            position: 0,
            width: (endHour / 24) * 100,
            mealVoucher: false, // Solo la prima parte ha il buono pasto
            isActive: isActive && !timesheet.end_time
          };

          employee.days[secondDayIndex].entries.push(secondEntry);
        }
      }

      // Aggiorna i totali una sola volta
      if (!isNaN(totalDuration)) {
        const regularHours = Math.min(totalDuration, 8);
        const overtimeHours = Math.max(0, totalDuration - 8);
        employee.totals.total_hours += totalDuration;
        employee.totals.overtime_hours += overtimeHours;
        employee.totals.night_hours += timesheet.night_hours || 0;
      }
    };

    // Processa i timesheet per ogni dipendente
    timesheets.forEach(timesheet => {
      const employee = employeesMap.get(timesheet.user_id);
      if (!employee) return;

      splitNightShift(timesheet, employee);
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

  const renderTimelineEntry = (entry: TimelineEntry) => {
    const regularWidth = (entry.regular_duration / entry.duration) * entry.width;
    const overtimeWidth = (entry.overtime_duration / entry.duration) * entry.width;
    
    // Controlla se è un turno notturno (parte di un turno spezzato)
    const isNightShiftPart = entry.timesheet.id.includes('_part');
    const isFirstPart = entry.timesheet.id.includes('_part1');
    const isSecondPart = entry.timesheet.id.includes('_part2');
    const originalId = isNightShiftPart ? entry.timesheet.id.split('_part')[0] : entry.timesheet.id;
    
    return (
      <div
        key={entry.timesheet.id}
        className="absolute flex h-6 z-10 group"
        style={{ left: `${entry.position}%`, width: `${entry.width}%` }}
      >
        {/* Fascia orario normale */}
        {entry.regular_duration > 0 && (
          <div
            className={`h-full ${isNightShiftPart ? 'bg-blue-600' : 'bg-primary'} 
              ${isFirstPart ? 'rounded-l-sm' : isSecondPart ? 'rounded-r-sm' : 'rounded-l-sm'} 
              ${entry.overtime_duration === 0 && !isSecondPart ? 'rounded-r-sm' : ''} 
              ${entry.isActive ? 'animate-pulse' : ''} 
              cursor-pointer hover:opacity-80 transition-all
              flex items-center justify-between px-2 text-white text-xs
              ${isNightShiftPart ? 'border-2 border-blue-400' : ''}`}
            style={{ width: `${(regularWidth / entry.width) * 100}%` }}
            onClick={() => onEditTimesheet({ ...entry.timesheet, id: originalId })}
            title={isNightShiftPart ? `Turno notturno ${isFirstPart ? '(prima parte)' : '(seconda parte)'} - ${entry.start_time} - ${entry.end_time || 'in corso'}` : `${entry.start_time} - ${entry.end_time || 'in corso'}`}
          >
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{entry.regular_duration.toFixed(1)}h</span>
            </div>
            
            <div className="flex items-center gap-1">
              {entry.mealVoucher && <UtensilsCrossed className="h-3 w-3" />}
              {!isNightShiftPart && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 text-white hover:text-white hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTimesheet({ ...entry.timesheet, id: originalId });
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
                      onDeleteTimesheet(originalId);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Fascia straordinari */}
        {entry.overtime_duration > 0 && (
          <div
            className={`h-full ${isNightShiftPart ? 'bg-orange-600' : 'bg-orange-500'} 
              ${isFirstPart && entry.regular_duration === 0 ? 'rounded-l-sm' : ''} 
              ${!isFirstPart ? 'rounded-r-sm' : ''} 
              ${entry.isActive ? 'animate-pulse' : ''} 
              cursor-pointer hover:opacity-80 transition-all
              flex items-center justify-center text-white text-xs font-medium
              ${isNightShiftPart ? 'border-2 border-orange-400' : ''}`}
            style={{ width: `${(overtimeWidth / entry.width) * 100}%` }}
            onClick={() => onEditTimesheet({ ...entry.timesheet, id: originalId })}
            title={`Straordinari: ${entry.overtime_duration.toFixed(1)}h ${isNightShiftPart ? (isFirstPart ? '(prima parte)' : '(seconda parte)') : ''}`}
          >
            +{entry.overtime_duration.toFixed(1)}h
          </div>
        )}
        
        {/* Indicatore di connessione per turni notturni */}
        {isFirstPart && (
          <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-2 h-1 bg-blue-400 rounded-full animate-pulse" />
        )}
        {isSecondPart && (
          <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-2 h-1 bg-blue-400 rounded-full animate-pulse" />
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
                          {day.entries.map(renderTimelineEntry)}
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