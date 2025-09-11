import React, { useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, addWeeks, subWeeks, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Edit, Trash2, Clock, UtensilsCrossed } from 'lucide-react';
import { TimesheetWithProfile } from '@/types/timesheet';
import { BenefitsService } from '@/services/BenefitsService';

interface WeeklyTimelineViewProps {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  employeeSettings: any;
  companySettings: any;
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
}

interface TimelineEntry {
  timesheet: TimesheetWithProfile;
  startHour: number;
  endHour: number;
  duration: number;
  isActive: boolean;
  mealVoucher: boolean;
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
  onDeleteTimesheet
}: WeeklyTimelineViewProps) {
  const [currentWeek, setCurrentWeek] = useState(() => {
    return dateFilter ? parseISO(dateFilter) : new Date();
  });

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Organizza i dati per dipendente e giorno
  const employeeData = useMemo(() => {
    const employeesMap = new Map<string, EmployeeWeekData>();

    // Inizializza i dipendenti dai timesheet
    timesheets.forEach(timesheet => {
      if (!timesheet.profiles) return;

      const key = timesheet.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: timesheet.user_id,
          first_name: timesheet.profiles.first_name,
          last_name: timesheet.profiles.last_name,
          email: timesheet.profiles.email,
          days: weekDays.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            entries: [],
            absences: []
          })),
          totals: { total_hours: 0, overtime_hours: 0, night_hours: 0 }
        });
      }

      const employee = employeesMap.get(key)!;
      const dayIndex = weekDays.findIndex(day => isSameDay(day, parseISO(timesheet.date)));
      
      if (dayIndex !== -1) {
        const day = employee.days[dayIndex];
        
        // Calcola ore timeline
        let startHour = 0;
        let endHour = 0;
        let duration = 0;
        let isActive = false;
        
        if (timesheet.start_time) {
          const startTime = parseISO(timesheet.start_time);
          startHour = startTime.getHours() + startTime.getMinutes() / 60;
          
          if (timesheet.end_time) {
            const endTime = parseISO(timesheet.end_time);
            endHour = endTime.getHours() + endTime.getMinutes() / 60;
            duration = timesheet.total_hours || 0;
          } else {
            // Timesheet attivo
            const currentTime = new Date();
            endHour = currentTime.getHours() + currentTime.getMinutes() / 60;
            const diffMs = currentTime.getTime() - startTime.getTime();
            duration = Math.max(0, diffMs / (1000 * 60 * 60));
            isActive = true;
          }
        }

        // Calcola buoni pasto
        const employeeSettingsForUser = employeeSettings[timesheet.user_id];
        BenefitsService.validateTemporalUsage('WeeklyTimelineView.getMealBenefits');
        const mealBenefits = BenefitsService.calculateMealBenefitsSync(
          timesheet, 
          employeeSettingsForUser, 
          companySettings
        );

        day.entries.push({
          timesheet,
          startHour,
          endHour,
          duration,
          isActive,
          mealVoucher: mealBenefits.mealVoucher
        });

        employee.totals.total_hours += duration;
        employee.totals.overtime_hours += timesheet.overtime_hours || 0;
        employee.totals.night_hours += timesheet.night_hours || 0;
      }
    });

    // Aggiungi assenze
    absences.forEach(absence => {
      if (!absence.profiles) return;

      const key = absence.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: absence.user_id,
          first_name: absence.profiles.first_name,
          last_name: absence.profiles.last_name,
          email: absence.profiles.email,
          days: weekDays.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            entries: [],
            absences: []
          })),
          totals: { total_hours: 0, overtime_hours: 0, night_hours: 0 }
        });
      }

      const employee = employeesMap.get(key)!;
      const dayIndex = weekDays.findIndex(day => isSameDay(day, parseISO(absence.date)));
      
      if (dayIndex !== -1) {
        employee.days[dayIndex].absences.push(absence);
      }
    });

    return Array.from(employeesMap.values());
  }, [timesheets, absences, weekDays, employeeSettings, companySettings]);

  const navigatePrevWeek = () => setCurrentWeek(prev => subWeeks(prev, 1));
  const navigateNextWeek = () => setCurrentWeek(prev => addWeeks(prev, 1));
  const navigateToday = () => setCurrentWeek(new Date());

  const renderTimelineBar = (entry: TimelineEntry) => {
    const startPercent = (entry.startHour / 24) * 100;
    const durationPercent = (entry.duration / 24) * 100;
    
    return (
      <div
        key={entry.timesheet.id}
        className={`absolute h-6 rounded flex items-center justify-between px-2 text-xs text-white transition-all ${
          entry.isActive 
            ? 'bg-green-500 animate-pulse' 
            : 'bg-primary hover:bg-primary/80'
        }`}
        style={{
          left: `${startPercent}%`,
          width: `${Math.max(durationPercent, 5)}%`
        }}
        title={`${format(parseISO(entry.timesheet.start_time!), 'HH:mm')} - ${
          entry.timesheet.end_time 
            ? format(parseISO(entry.timesheet.end_time), 'HH:mm')
            : 'In corso'
        } (${entry.duration.toFixed(1)}h)`}
      >
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{entry.duration.toFixed(1)}h</span>
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
            <Button variant="outline" size="sm" onClick={navigatePrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={navigateToday}>
              Oggi
            </Button>
            <Button variant="outline" size="sm" onClick={navigateNextWeek}>
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
                        Totale: {employee.totals.total_hours.toFixed(1)}h
                      </span>
                      {employee.totals.overtime_hours > 0 && (
                        <span className="text-orange-600">
                          Straord: {employee.totals.overtime_hours.toFixed(1)}h
                        </span>
                      )}
                      {employee.totals.night_hours > 0 && (
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
                      {timeMarkers.map(hour => (
                        <div
                          key={hour}
                          className="absolute text-xs text-muted-foreground"
                          style={{ left: `${(hour / 24) * 100}%` }}
                        >
                          {hour < 24 && format(new Date().setHours(hour, 0, 0, 0), 'HH:mm')}
                        </div>
                      ))}
                    </div>

                    {/* Days timeline */}
                    <div className="space-y-3">
                      {employee.days.map((day, dayIndex) => (
                        <div key={day.date} className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-24 text-sm font-medium">
                              {format(weekDays[dayIndex], 'EEE dd', { locale: it })}
                            </div>
                            <div className="flex-1 relative h-8 bg-muted/20 rounded border">
                              {/* Time grid lines */}
                              {timeMarkers.slice(0, 24).filter(h => h % 3 === 0).map(hour => (
                                <div
                                  key={hour}
                                  className="absolute top-0 bottom-0 w-px bg-border"
                                  style={{ left: `${(hour / 24) * 100}%` }}
                                />
                              ))}
                              
                              {/* Absences */}
                              {day.absences.map(absence => (
                                <div
                                  key={absence.id}
                                  className="absolute inset-0 bg-red-200 rounded flex items-center justify-center text-xs text-red-700"
                                >
                                  {absence.type === 'vacation' ? 'Ferie' : 
                                   absence.type === 'sick' ? 'Malattia' : 
                                   absence.type}
                                </div>
                              ))}
                              
                              {/* Timeline entries */}
                              {day.entries.map(entry => renderTimelineBar(entry))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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