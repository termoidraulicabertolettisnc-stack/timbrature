import React, { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Edit, Trash2, UtensilsCrossed, Clock, Plane, HeartPulse, MapPin } from 'lucide-react';
import { TimesheetWithProfile } from '@/types/timesheet';
import { BenefitsService } from '@/services/BenefitsService';
import { useWeeklyRealtimeHours } from '@/hooks/use-weekly-realtime-hours';

interface WeeklyTimelineViewProps {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  employeeSettings: any;
  companySettings: any;
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
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
  onNavigatePrevious,
  onNavigateNext,
  onNavigateToday
}: WeeklyTimelineViewProps) {
  const baseDate = parseISO(dateFilter);
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Organizza i dati per dipendente
  const employeeData = useMemo(() => {
    console.log('🔍 WeeklyTimelineView - Processing data:', {
      timesheets_count: timesheets.length,
      absences_count: absences.length,
      dateFilter,
      sample_timesheet: timesheets[0]
    });
    
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
    absences.forEach(absence => {
      if (!absence.profiles) return;

      const employeeId = absence.user_id;
      let employee = employeesMap.get(employeeId);
      
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
          employee.days[dayIndex].absences.push(absence);
        }
      }
    });

    // Processa i timesheet per ogni dipendente
    timesheets.forEach(timesheet => {
      const employee = employeesMap.get(timesheet.user_id);
      if (!employee) return;

      const dayIndex = employee.days.findIndex(day => day.date === timesheet.date);
      if (dayIndex === -1) return;

      const day = employee.days[dayIndex];

      // Calcola durata e posizione per timeline
      if (timesheet.start_time) {
        // Parse corretto: start_time è già un timestamp completo
        const startTime = new Date(timesheet.start_time);
        let endTime: Date;
        let duration: number;
        let isActive = false;

        if (timesheet.end_time) {
          endTime = new Date(timesheet.end_time);
          duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        } else {
          // Timesheet aperto - calcola in tempo reale
          endTime = new Date();
          duration = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
          isActive = true;
        }

        // Validazione della durata
        if (isNaN(duration) || duration < 0) {
          console.warn('⚠️ Invalid duration calculated:', { timesheet_id: timesheet.id, startTime, endTime, duration });
          return; // Skip questo timesheet se la durata non è valida
        }

        // Calcola durate separate per orario normale e straordinario
        const regularHours = Math.min(duration, 8);
        const overtimeHours = Math.max(0, duration - 8);

        // Posizione sulla timeline (0-24 ore) - estrai l'ora dal timestamp
        const startHour = startTime.getHours() + startTime.getMinutes() / 60;
        const endHour = Math.min(24, startHour + duration);
        const position = (startHour / 24) * 100;
        const width = ((endHour - startHour) / 24) * 100;

        // Calcola meal voucher
        const employeeSetting = employeeSettings[timesheet.user_id];
        BenefitsService.validateTemporalUsage('WeeklyTimelineView');
        const mealBenefits = BenefitsService.calculateMealBenefitsSync(
          timesheet,
          employeeSetting,
          companySettings
        );

        const entry: TimelineEntry = {
          timesheet,
          start_time: format(startTime, 'HH:mm:ss'), // Converti a formato orario
          end_time: timesheet.end_time ? format(new Date(timesheet.end_time), 'HH:mm:ss') : null,
          duration,
          regular_duration: regularHours,
          overtime_duration: overtimeHours,
          position,
          width,
          mealVoucher: mealBenefits.mealVoucher,
          isActive
        };

        day.entries.push(entry);

        // Aggiorna i totali con validazione
        if (!isNaN(duration)) {
          employee.totals.total_hours += duration;
          employee.totals.overtime_hours += overtimeHours;
          employee.totals.night_hours += timesheet.night_hours || 0;
        }
      }
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
    
    return (
      <div
        key={entry.timesheet.id}
        className="absolute flex h-6 z-10"
        style={{ left: `${entry.position}%`, width: `${entry.width}%` }}
      >
        {/* Fascia orario normale */}
        {entry.regular_duration > 0 && (
          <div
            className={`h-full bg-primary rounded-l-sm ${entry.overtime_duration === 0 ? 'rounded-r-sm' : ''} 
              ${entry.isActive ? 'animate-pulse' : ''} 
              cursor-pointer hover:bg-primary/80 transition-colors 
              flex items-center justify-between px-2 text-white text-xs`}
            style={{ width: `${(regularWidth / entry.width) * 100}%` }}
            onClick={() => onEditTimesheet(entry.timesheet)}
          >
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{entry.regular_duration.toFixed(1)}h</span>
            </div>
            
            <div className="flex items-center gap-1">
              {entry.mealVoucher && <UtensilsCrossed className="h-3 w-3" />}
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 text-white hover:text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditTimesheet(entry.timesheet);
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
                    onDeleteTimesheet(entry.timesheet.id);
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
              cursor-pointer hover:bg-orange-600 transition-colors 
              flex items-center justify-center text-white text-xs font-medium`}
            style={{ width: `${(overtimeWidth / entry.width) * 100}%` }}
            onClick={() => onEditTimesheet(entry.timesheet)}
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
                            {day.absences.map((absence, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-xs gap-1"
                              >
                                {absence.type === 'sick_leave' && <HeartPulse className="h-3 w-3" />}
                                {absence.type === 'vacation' && <Plane className="h-3 w-3" />}
                                {absence.type === 'business_trip' && <MapPin className="h-3 w-3" />}
                                {absence.type}
                              </Badge>
                            ))}
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