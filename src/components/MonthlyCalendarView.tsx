import React, { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, parseISO, isSameDay, addMonths, subMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Edit, Trash2, UtensilsCrossed, Plane, HeartPulse } from 'lucide-react';
import { TimesheetWithProfile } from '@/types/timesheet';
import { BenefitsService } from '@/services/BenefitsService';

interface MonthlyCalendarViewProps {
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

interface DayData {
  date: string;
  timesheets: TimesheetWithProfile[];
  absences: any[];
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
}

interface EmployeeMonthData {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  days: { [date: string]: DayData };
  totals: {
    regular_hours: number;
    overtime_hours: number;
    total_hours: number;
  };
}

export function MonthlyCalendarView({
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
}: MonthlyCalendarViewProps) {
  const currentMonth = parseISO(dateFilter);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Organizza i dati per dipendente
  const employeeData = useMemo(() => {
    console.log('🔍 MonthlyCalendarView - Processing data:', {
      timesheets_count: timesheets.length,
      dateFilter,
      currentMonth: format(currentMonth, 'yyyy-MM-dd'),
      monthStart: format(monthStart, 'yyyy-MM-dd'),
      monthEnd: format(monthEnd, 'yyyy-MM-dd')
    });

    const employeesMap = new Map<string, EmployeeMonthData>();

    // Inizializza i dipendenti dai timesheet
    timesheets.forEach(timesheet => {
      console.log('📋 Processing timesheet:', {
        date: timesheet.date,
        user: timesheet.profiles?.first_name,
        start_time: timesheet.start_time
      });
      
      if (!timesheet.profiles) return;

      const key = timesheet.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: timesheet.user_id,
          first_name: timesheet.profiles.first_name,
          last_name: timesheet.profiles.last_name,
          email: timesheet.profiles.email,
          days: {},
          totals: { regular_hours: 0, overtime_hours: 0, total_hours: 0 }
        });
      }

      const employee = employeesMap.get(key)!;
      const date = timesheet.date;

      if (!employee.days[date]) {
        employee.days[date] = {
          date,
          timesheets: [],
          absences: [],
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        };
      }

      employee.days[date].timesheets.push(timesheet);

      // Calcola ore (con tempo reale per timesheet aperti)
      let hours = 0;
      if (timesheet.end_time) {
        hours = timesheet.total_hours || 0;
      } else if (timesheet.start_time) {
        const startTime = new Date(timesheet.start_time);
        const currentTime = new Date();
        const diffMs = currentTime.getTime() - startTime.getTime();
        hours = Math.max(0, diffMs / (1000 * 60 * 60));
      }

      const regularHours = Math.min(hours, 8);
      const overtimeHours = Math.max(0, hours - 8);

      employee.days[date].regular_hours += regularHours;
      employee.days[date].overtime_hours += overtimeHours;
      employee.days[date].night_hours += timesheet.night_hours || 0;

      employee.totals.regular_hours += regularHours;
      employee.totals.overtime_hours += overtimeHours;
      employee.totals.total_hours += hours;

      // Calcola buoni pasto
      const employeeSettingsForUser = employeeSettings[timesheet.user_id];
      BenefitsService.validateTemporalUsage('MonthlyCalendarView.getMealBenefits');
      const mealBenefits = BenefitsService.calculateMealBenefitsSync(
        timesheet, 
        employeeSettingsForUser, 
        companySettings
      );
      
      if (mealBenefits.mealVoucher) {
        employee.days[date].meal_vouchers += 1;
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
          days: {},
          totals: { regular_hours: 0, overtime_hours: 0, total_hours: 0 }
        });
      }

      const employee = employeesMap.get(key)!;
      const date = absence.date;

      if (!employee.days[date]) {
        employee.days[date] = {
          date,
          timesheets: [],
          absences: [],
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        };
      }

      employee.days[date].absences.push(absence);
    });

    console.log('📊 Final employee data:', Array.from(employeesMap.values()));
    return Array.from(employeesMap.values());
  }, [timesheets, absences, employeeSettings, companySettings, currentMonth]);

  const getWeeks = () => {
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  };

  const renderDayContent = (day: Date, employee: EmployeeMonthData) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayData = employee.days[dateStr];
    const isCurrentMonth = isSameMonth(day, currentMonth);

    if (!dayData || !isCurrentMonth) {
      return (
        <div className={`min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''}`}>
          <div className="text-xs text-muted-foreground">{format(day, 'd')}</div>
        </div>
      );
    }

    const hasAbsence = dayData.absences.length > 0;
    const absence = dayData.absences[0];

    return (
      <div className="min-h-[60px] p-1 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{format(day, 'd')}</span>
          {dayData.timesheets.length > 0 && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => onEditTimesheet(dayData.timesheets[0])}
              >
                <Edit className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 text-red-600"
                onClick={() => onDeleteTimesheet(dayData.timesheets[0].id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {hasAbsence ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {absence.type === 'vacation' && <Plane className="h-3 w-3 text-blue-500" />}
              {absence.type === 'sick' && <HeartPulse className="h-3 w-3 text-red-500" />}
              <span className="text-xs text-muted-foreground capitalize">
                {absence.type === 'vacation' ? 'Ferie' : 
                 absence.type === 'sick' ? 'Malattia' : 
                 absence.type}
              </span>
            </div>
          </div>
        ) : dayData.timesheets.length > 0 ? (
          <div className="space-y-1">
            <div className="text-xs">
              <div className="text-blue-600">O: {dayData.regular_hours.toFixed(1)}h</div>
              {dayData.overtime_hours > 0 && (
                <div className="text-orange-600">S: {dayData.overtime_hours.toFixed(1)}h</div>
              )}
            </div>
            
            <div className="text-xs font-medium">
              {dayData.regular_hours + dayData.overtime_hours > 0 && 
                `${(dayData.regular_hours + dayData.overtime_hours).toFixed(1)}h`
              }
            </div>
            
            {dayData.meal_vouchers > 0 && (
              <UtensilsCrossed className="h-3 w-3 text-green-600" />
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Vista Mensile - {format(currentMonth, 'MMMM yyyy', { locale: it })}
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
          Ore per giorno del mese ({employeeData.length} dipendenti)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {employeeData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun timesheet trovato per questo mese
          </div>
        ) : (
          <div className="space-y-8">
            {employeeData.map(employee => (
              <div key={employee.user_id} className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {employee.first_name} {employee.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{employee.email}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-blue-600 font-medium">
                      {employee.totals.regular_hours.toFixed(1)}h
                    </span>
                    <span className="text-orange-600 font-medium">
                      {employee.totals.overtime_hours.toFixed(1)}h
                    </span>
                    <span className="font-semibold">
                      {employee.totals.total_hours.toFixed(1)}h
                    </span>
                  </div>
                </div>

                {getWeeks().map((week, weekIndex) => (
                  <div key={weekIndex} className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Settimana {format(week[0], 'dd/MM', { locale: it })} - {format(week[6], 'dd/MM', { locale: it })}
                    </div>
                    <div className="grid grid-cols-7 border rounded-lg overflow-hidden">
                      {week.map((day, dayIndex) => {
                        const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
                        return (
                          <div key={dayIndex} className="border-r last:border-r-0">
                            <div className="bg-muted/50 p-2 text-center">
                              <div className="text-xs font-medium">{dayNames[dayIndex]}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(day, 'dd', { locale: it })}
                              </div>
                            </div>
                            <div className="border-t">
                              {renderDayContent(day, employee)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}