import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, Clock, CalendarX, UtensilsCrossed, PartyPopper } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, parseISO, getDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { TimesheetWithProfile } from '@/types/timesheet';
import { AbsenceIndicator } from './AbsenceIndicator';
import { sessionsForDay, utcToLocal } from '@/utils/timeSegments';
import { getContractedHoursForDay, hasMissingHours, formatMissingHours } from '@/utils/contractedHours';
import { calculateNetHours } from '@/utils/lunchBreakUtils';
import { AlertCircle } from 'lucide-react';
import { isHoliday as checkIsHoliday, getAllHolidays } from '@/services/ItalianHolidaysService';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MonthlyCalendarViewProps {
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
  onEditDay?: (date: string, employee: any, timesheet: TimesheetWithProfile | null, sessions: any[]) => void;
}

interface DayData {
  date: string;
  timesheets: TimesheetWithProfile[];
  sessions: any[];
  absences: any[];
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  total_hours: number;
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
  onAddTimesheet,
  onAddAbsence,
  onNavigatePrevious,
  onNavigateNext,
  onNavigateToday,
  onEditDay
}: MonthlyCalendarViewProps) {
  console.log('🚨 MonthlyCalendarView MOUNTED:', {
    timesheets_count: timesheets.length,
    first_timesheet: timesheets[0]
  });

  const employeeData = useMemo(() => {
    console.log('🚨🚨🚨 MonthlyCalendarView - COMPONENTE TRIGGERED! 🚨🚨🚨');
    
    // Calcola le date del mese
    const currentMonth = parseISO(dateFilter);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    console.log('🔍 MonthlyCalendarView - Processing data:', {
      timesheets_count: timesheets.length,
      absences_count: absences.length,
      dateFilter,
      currentMonth: format(currentMonth, 'yyyy-MM-dd'),
      monthStart: format(monthStart, 'yyyy-MM-dd'),
      monthEnd: format(monthEnd, 'yyyy-MM-dd'),
      first_timesheet: timesheets.length > 0 ? {
        id: timesheets[0].id,
        date: timesheets[0].date,
        user_id: timesheets[0].user_id,
        sessions_count: timesheets[0].timesheet_sessions?.length || 0
      } : null,
      sample_absence: absences[0]
    });
    
    try {
      const employeesMap = new Map<string, EmployeeMonthData>();

    // ✅ Processa i timesheets usando sessionsForDay per gestire correttamente sessioni intergiornaliere
    timesheets.forEach(timesheet => {
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
      
      // ✅ Processa ogni giorno del calendario per questo timesheet
      calendarDays.forEach(day => {
        const dayISO = format(day, 'yyyy-MM-dd');
        
        // ✅ Usa sessionsForDay per ottenere solo le sessioni che appartengono a questo giorno
        const segments = sessionsForDay(timesheet, dayISO);
        
        if (segments.length === 0) return;
        
        // Inizializza il giorno se non esiste
        if (!employee.days[dayISO]) {
          employee.days[dayISO] = {
            date: dayISO,
            timesheets: [],
            sessions: [],
            absences: [],
            regular_hours: 0,
            overtime_hours: 0,
            night_hours: 0,
            total_hours: 0,
            meal_vouchers: 0
          };
        }
        
        // Aggiungi il timesheet solo se non è già presente
        if (!employee.days[dayISO].timesheets.some(ts => ts.id === timesheet.id)) {
          employee.days[dayISO].timesheets.push(timesheet);
        }
        
        // ✅ Calcola le ore per questo giorno dai segmenti filtrati
        let grossHours = 0;
        segments.forEach(segment => {
          const localStart = utcToLocal(segment.startUtc);
          const localEnd = utcToLocal(segment.endUtc);
          const durationMs = localEnd.getTime() - localStart.getTime();
          const durationHours = durationMs / (1000 * 60 * 60);
          grossHours += durationHours;
          
          // Aggiungi le sessioni
          employee.days[dayISO].sessions.push({
            id: segment.sessionId,
            start_time: segment.startUtc,
            end_time: segment.endUtc,
            duration: durationHours
          });
        });
        
        // ✅ Sottrai la pausa pranzo usando le impostazioni dipendente/azienda
        const employeeSetting = employeeSettings?.[timesheet.user_id];
        const { netHours: dayTotalHours, lunchMinutesDeducted } = calculateNetHours(
          grossHours,
          timesheet,
          employeeSetting,
          companySettings
        );
        
        console.log('🍽️ MonthlyCalendarView - Lunch deduction:', {
          userId: timesheet.user_id,
          date: dayISO,
          grossHours: grossHours.toFixed(2),
          lunchMinutesDeducted,
          netHours: dayTotalHours.toFixed(2)
        });
        
        // Usa le ore contrattualizzate per il giorno dalla gerarchia employee_settings > company_settings
        const empSettings = employeeSettings[timesheet.user_id];
        const contractedHoursForDay = getContractedHoursForDay(dayISO, empSettings, companySettings);
        const regularHours = Math.min(dayTotalHours, contractedHoursForDay);
        const overtimeHours = Math.max(0, dayTotalHours - contractedHoursForDay);
        
        employee.days[dayISO].regular_hours += regularHours;
        employee.days[dayISO].overtime_hours += overtimeHours;
        employee.days[dayISO].total_hours += dayTotalHours;
        
        // ✅ Night hours: proporzione basata sulle ore di questo giorno
        if (timesheet.night_hours && timesheet.total_hours) {
          const nightHoursProportion = (timesheet.night_hours / timesheet.total_hours) * dayTotalHours;
          employee.days[dayISO].night_hours += nightHoursProportion;
        }
        
        // ✅ Meal voucher: conta solo se questo è il giorno principale del timesheet
        if (timesheet.meal_voucher_earned && dayISO === timesheet.date) {
          employee.days[dayISO].meal_vouchers += 1;
        }
        
        employee.totals.regular_hours += regularHours;
        employee.totals.overtime_hours += overtimeHours;
        employee.totals.total_hours += dayTotalHours;
      });
    });

    // Aggiungi le assenze
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
          sessions: [],
          absences: [],
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          total_hours: 0,
          meal_vouchers: 0
        };
      }

      employee.days[date].absences.push(absence);
    });

    return Array.from(employeesMap.values());
    } catch (error) {
      console.error('🚨 ERROR in useMemo:', error);
      return [];
    }
  }, [timesheets, absences, employeeSettings, companySettings, dateFilter]);

  // Ricalcola le date per le funzioni di rendering
  const currentMonth = parseISO(dateFilter);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getWeeks = () => {
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  };

  // Ottieni le festività per il mese corrente
  const holidaysMap = useMemo(() => {
    const year = currentMonth.getFullYear();
    const holidays = getAllHolidays(year);
    const map = new Map<string, string>();
    holidays.forEach(h => map.set(h.date, h.name));
    return map;
  }, [currentMonth]);

  const renderDayContent = (day: Date, employee: EmployeeMonthData) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayData = employee.days[dateStr];
    const isCurrentMonth = isSameMonth(day, currentMonth);
    const dayOfWeek = getDay(day);
    const isSunday = dayOfWeek === 0;
    const holidayName = holidaysMap.get(dateStr);
    const isHolidayDay = !!holidayName;
    
    // Calcola ore contrattualizzate per questo giorno
    const employeeSetting = employeeSettings?.[employee.user_id];
    const contractedHours = getContractedHoursForDay(dateStr, employeeSetting, companySettings);
    const workedHours = dayData?.total_hours || 0;
    const hasAbsence = dayData?.absences && dayData.absences.length > 0;
    
    // Non mostrare warning di ore mancanti per festivi e domeniche
    const showMissingHoursWarning = !hasAbsence && !isHolidayDay && !isSunday && hasMissingHours(workedHours, contractedHours);
    const missingHours = contractedHours - workedHours;

    // Giorno festivo o domenica senza dati
    if ((isHolidayDay || isSunday) && !dayData) {
      return (
        <div className={`min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''}`}>
          {isCurrentMonth && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-amber-50 border border-amber-200 rounded p-1 text-center">
                    <PartyPopper className="h-4 w-4 text-amber-600 mx-auto" />
                    <span className="text-xs text-amber-700 font-medium">
                      {holidayName || 'Domenica'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{holidayName || 'Domenica - giorno di riposo'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    }

    if (!dayData || !isCurrentMonth) {
      // Non mostrare warning ore mancanti per festivi e domeniche
      const shouldShowMissingWarning = isCurrentMonth && contractedHours > 0 && !isHolidayDay && !isSunday;
      
      return (
        <div className={`min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''}`}>
          {/* Indicatore festivo anche se non ci sono dati */}
          {isCurrentMonth && isHolidayDay && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="bg-amber-50 border border-amber-200 rounded p-1 mb-1 text-center">
                    <PartyPopper className="h-3 w-3 text-amber-600 mx-auto" />
                    <span className="text-xs text-amber-700">{holidayName}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Festività: {holidayName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {shouldShowMissingWarning && (
            <div className="bg-red-50 border border-red-200 rounded p-1">
              <div className="flex items-center gap-1 text-red-600 mb-1">
                <AlertCircle className="h-3 w-3" />
                <span className="text-xs font-medium">-{contractedHours.toFixed(1)}h</span>
              </div>
              <div className="text-xs text-red-700 mb-1">Nessuna timbratura</div>
            </div>
          )}
          {isCurrentMonth && !isHolidayDay && !isSunday && (
            <div className="flex gap-1 mt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onAddTimesheet(dateStr, employee.user_id)}
                title="Aggiungi timbratura"
              >
                <Clock className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onAddAbsence(dateStr, employee.user_id)}
                title="Aggiungi assenza"
              >
                <CalendarX className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={`min-h-[60px] p-1 ${!isCurrentMonth ? 'opacity-30' : ''} ${isHolidayDay ? 'bg-amber-50/50' : ''}`}>
        {/* Indicatore festivo in alto se è un giorno festivo */}
        {isHolidayDay && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs mb-1 flex items-center gap-1 w-fit">
                  <PartyPopper className="h-3 w-3" />
                  Festivo
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>{holidayName}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Mostra assenze se presenti */}
        {dayData.absences.length > 0 && (
          <div className="mb-1">
            <AbsenceIndicator 
              absences={dayData.absences}
              onAbsenceClick={(absence) => {
                if (onEditDay) {
                  const employee = {
                    user_id: absence.user_id,
                    first_name: absence.profiles?.first_name || '',
                    last_name: absence.profiles?.last_name || '',
                    email: absence.profiles?.email || '',
                  };
                  onEditDay(dateStr, employee, null, []);
                }
              }}
            />
          </div>
        )}
        
        {/* Mostra ore lavorate se presenti */}
        {dayData.total_hours > 0 && (
          <div 
            className={`space-y-1 cursor-pointer hover:bg-gray-50 rounded p-1 ${showMissingHoursWarning ? 'bg-orange-50 border border-orange-200' : ''}`}
            onClick={() => {
              if (onEditDay && dayData.timesheets.length > 0) {
                const mainTimesheet = dayData.timesheets[0];
                const employee = {
                  user_id: mainTimesheet.user_id,
                  first_name: mainTimesheet.profiles?.first_name || '',
                  last_name: mainTimesheet.profiles?.last_name || '',
                  email: mainTimesheet.profiles?.email || '',
                };
                onEditDay(dateStr, employee, mainTimesheet, dayData.sessions);
              }
            }}
          >
            {showMissingHoursWarning && (
              <div className="flex items-center gap-1 text-orange-600 mb-1">
                <AlertCircle className="h-3 w-3" />
                <span className="text-xs font-medium">{formatMissingHours(missingHours)}</span>
              </div>
            )}
            
            <div className="text-xs">
              {dayData.sessions.length > 0 && (
                <div className="text-gray-500 mb-1">
                  {dayData.sessions.length} {dayData.sessions.length === 1 ? 'sessione' : 'sessioni'}
                </div>
              )}
              <div className="text-blue-600">O: {dayData.regular_hours.toFixed(1)}h</div>
              {dayData.overtime_hours > 0 && (
                <div className="text-orange-600">S: {dayData.overtime_hours.toFixed(1)}h</div>
              )}
              {dayData.night_hours > 0 && (
                <div className="text-purple-600">N: {dayData.night_hours.toFixed(1)}h</div>
              )}
            </div>
            
            <div className="text-xs font-medium flex items-center gap-1">
              Totale: {dayData.total_hours.toFixed(1)}h
              {contractedHours > 0 && <span className="text-gray-400">/ {contractedHours.toFixed(1)}h</span>}
              {dayData.night_hours > 0 && (
                <div className="w-2 h-2 bg-purple-600 rounded-full" title="Turno notturno" />
              )}
            </div>
            
            {dayData.meal_vouchers > 0 && (
              <UtensilsCrossed className="h-3 w-3 text-green-600" />
            )}
          </div>
        )}
        
        {/* Mostra bottoni solo se non ci sono né timbrature né assenze */}
        {dayData.total_hours === 0 && dayData.absences.length === 0 && (
          <div className="flex gap-1 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onAddTimesheet(dateStr, employee.user_id)}
              title="Aggiungi timbratura"
            >
              <Clock className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onAddAbsence(dateStr, employee.user_id)}
              title="Aggiungi assenza"
            >
              <CalendarX className="h-3 w-3" />
            </Button>
          </div>
        )}
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
            Nessuna timbratura trovata per questo mese
          </div>
        ) : (
          <div className="space-y-6">
            {employeeData.map((employee) => (
              <div key={employee.user_id}>
                <h3 className="font-medium mb-2">
                  {employee.first_name} {employee.last_name}
                  <span className="text-sm text-muted-foreground ml-2">
                    ({employee.email})
                  </span>
                  <span className="text-sm font-normal ml-4">
                    Ordinarie: {employee.totals.regular_hours.toFixed(1)}h | 
                    Straordinarie: {employee.totals.overtime_hours.toFixed(1)}h | 
                    Totale: {employee.totals.total_hours.toFixed(1)}h
                  </span>
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-7 bg-gray-50 text-xs font-medium">
                    {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((day) => (
                      <div key={day} className="p-2 text-center border-r last:border-r-0">
                        {day}
                      </div>
                    ))}
                  </div>
                  {getWeeks().map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-cols-7">
                      {week.map((day) => (
                        <div
                          key={day.toISOString()}
                          className="border-r border-b last:border-r-0 group"
                        >
                          <div className="text-xs text-gray-500 p-1">
                            {format(day, 'd')}
                          </div>
                          {renderDayContent(day, employee)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}