import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarIcon, Clock, Edit, Filter, Download, Users, ChevronDown, ChevronRight, Trash2, Navigation, ChevronLeft, Plus, UserPlus, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, addDays, isSameDay, subDays, subWeeks, subMonths, addWeeks, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { OvertimeTracker } from '@/components/OvertimeTracker';
import { TimesheetTimeline } from '@/components/TimesheetTimeline';
import LocationTrackingIndicator from '@/components/LocationTrackingIndicator';
import { TimesheetEditDialog } from '@/components/TimesheetEditDialog';
import { TimesheetInsertDialog } from '@/components/TimesheetInsertDialog';
import { AbsenceInsertDialog } from '@/components/AbsenceInsertDialog';
import { DayActionMenu } from '@/components/DayActionMenu';
import { AbsenceIndicator } from '@/components/AbsenceIndicator';
import LocationDisplay from '@/components/LocationDisplay';
import { useRealtimeHours } from '@/hooks/use-realtime-hours';
import { TimesheetWithProfile } from '@/types/timesheet';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// Componente per mostrare ore con calcolo in tempo reale
function HoursDisplay({ timesheet }: { timesheet: TimesheetWithProfile }) {
  const realtimeHours = useRealtimeHours(timesheet);
  
  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };
  
  if (!timesheet.end_time && timesheet.start_time) {
    // Timesheet aperto - mostra ore in tempo reale
    return <span className="text-blue-600">{formatHours(realtimeHours)} (in corso)</span>;
  }
  
  // Timesheet chiuso - mostra ore totali
  return <span>{formatHours(timesheet.total_hours)}</span>;
}

interface EmployeeSummary {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
  saturday_hours: number;
  holiday_hours: number;
  timesheets: TimesheetWithProfile[];
}

interface DailyHours {
  date: string;
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
  timesheets: TimesheetWithProfile[];
  absences: any[];
}

interface EmployeeWeeklyData {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  days: DailyHours[];
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
}

interface EmployeeMonthlyData {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  days: DailyHours[];
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
}

export default function AdminTimesheets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [timesheets, setTimesheets] = useState<TimesheetWithProfile[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  // Edit dialog state
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetWithProfile | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Insert dialog states
  const [timesheetInsertDialogOpen, setTimesheetInsertDialogOpen] = useState(false);
  const [absenceInsertDialogOpen, setAbsenceInsertDialogOpen] = useState(false);
  const [selectedDateForDialog, setSelectedDateForDialog] = useState<Date | undefined>(undefined);
  
  // Filtri
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');

  // State per l'aggiornamento in tempo reale
  const [realtimeUpdateTrigger, setRealtimeUpdateTrigger] = useState(0);

  // Aggiorna ogni minuto per mostrare le ore in tempo reale
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimeUpdateTrigger(prev => prev + 1);
    }, 60000); // Aggiorna ogni minuto

    return () => clearInterval(interval);
  }, []);

  // Setup realtime subscription for timesheets
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timesheets'
        },
        (payload) => {
          console.log('💫 Timesheet realtime update:', payload);
          // Ricarica i dati quando ci sono cambiamenti
          loadTimesheets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadTimesheets();
  }, [selectedEmployee, selectedProject, dateFilter, activeView, realtimeUpdateTrigger]);

  const loadInitialData = async () => {
    try {
      // Carica dipendenti
      const { data: employeesData, error: employeesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('is_active', true)
        .order('first_name');

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);

      // Carica progetti
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati iniziali",
        variant: "destructive",
      });
    }
  };

  const deleteTimesheet = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo timesheet? Questa azione non può essere annullata.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('timesheets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Timesheet eliminato con successo",
      });

      // Ricarica i dati
      loadTimesheets();
    } catch (error) {
      console.error('Error deleting timesheet:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione del timesheet",
        variant: "destructive",
      });
    }
  };

  const loadTimesheets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('timesheets')
        .select(`
          *,
          profiles!timesheets_user_id_fkey (
            first_name,
            last_name,
            email
          ),
          projects (
            name
          )
        `);

      // Applica filtri
      if (selectedEmployee !== 'all') {
        query = query.eq('user_id', selectedEmployee);
      }

      if (selectedProject !== 'all') {
        query = query.eq('project_id', selectedProject);
      }

      // Filtri per periodo
      const baseDate = parseISO(dateFilter);
      let startDate: Date;
      let endDate: Date;

      switch (activeView) {
        case 'weekly':
          startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
          endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
          break;
        case 'monthly':
          startDate = startOfMonth(baseDate);
          endDate = endOfMonth(baseDate);
          break;
        default: // daily
          startDate = baseDate;
          endDate = baseDate;
      }

      query = query
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setTimesheets((data as unknown as TimesheetWithProfile[]) || []);

      // Carica anche le assenze per lo stesso periodo
      await loadAbsences(startDate, endDate);

    } catch (error) {
      console.error('Error loading timesheets:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei timesheet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAbsences = async (startDate: Date, endDate: Date) => {
    try {
      console.log('🔍 Caricamento assenze per periodo:', format(startDate, 'yyyy-MM-dd'), '-', format(endDate, 'yyyy-MM-dd'));
      
      // Step 1: Query per recuperare le assenze
      let absenceQuery = supabase
        .from('employee_absences')
        .select('*')
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date', { ascending: false });

      // Applica filtro dipendente se selezionato
      if (selectedEmployee !== 'all') {
        absenceQuery = absenceQuery.eq('user_id', selectedEmployee);
      }

      const { data: absenceData, error: absenceError } = await absenceQuery;
      if (absenceError) throw absenceError;
      
      console.log('📊 Assenze trovate:', absenceData?.length || 0, absenceData);

      if (!absenceData || absenceData.length === 0) {
        setAbsences([]);
        return;
      }

      // Step 2: Recupera i profili degli utenti che hanno assenze
      const userIds = [...new Set(absenceData.map(absence => absence.user_id))];
      console.log('👥 User IDs con assenze:', userIds);
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;
      console.log('👤 Profili recuperati:', profilesData);

      // Step 3: Combina i dati lato client
      const absencesWithProfiles = absenceData.map(absence => {
        const profile = profilesData?.find(p => p.user_id === absence.user_id);
        return {
          ...absence,
          profiles: profile || null
        };
      });

      console.log('✅ Assenze con profili:', absencesWithProfiles);
      setAbsences(absencesWithProfiles);

    } catch (error) {
      console.error('❌ Errore nel caricamento assenze:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle assenze",
        variant: "destructive",
      });
    }
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    return format(parseISO(timeString), 'HH:mm');
  };

  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };

  const getEmployeeName = (timesheet: TimesheetWithProfile) => {
    if (!timesheet.profiles) return 'Dipendente sconosciuto';
    return `${timesheet.profiles.first_name} ${timesheet.profiles.last_name}`;
  };

  const filteredTimesheets = timesheets.filter(timesheet => {
    if (!searchTerm) return true;
    const employeeName = getEmployeeName(timesheet).toLowerCase();
    const projectName = timesheet.projects?.name?.toLowerCase() || '';
    return employeeName.includes(searchTerm.toLowerCase()) || 
           projectName.includes(searchTerm.toLowerCase());
  });

  // Aggrega i timesheet per dipendente
  const aggregateTimesheetsByEmployee = (): EmployeeSummary[] => {
    const employeesMap = new Map<string, EmployeeSummary>();

    filteredTimesheets.forEach(timesheet => {
      if (!timesheet.profiles) return;

      const key = timesheet.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: timesheet.user_id,
          first_name: timesheet.profiles.first_name,
          last_name: timesheet.profiles.last_name,
          email: timesheet.profiles.email,
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0,
          saturday_hours: 0,
          holiday_hours: 0,
          timesheets: []
        });
      }

      const employee = employeesMap.get(key)!;
      employee.timesheets.push(timesheet);
      
      // CORREZIONE: Calcola le ore in tempo reale per timesheet in corso
      let calculatedHours = 0;
      let calculatedOvertimeHours = 0;
      let calculatedNightHours = 0;
      
      if (timesheet.end_time) {
        // Timesheet chiuso: usa i valori calcolati
        calculatedHours = timesheet.total_hours || 0;
        calculatedOvertimeHours = timesheet.overtime_hours || 0;
        calculatedNightHours = timesheet.night_hours || 0;
      } else if (timesheet.start_time) {
        // Timesheet in corso: calcola le ore in tempo reale
        const startTime = new Date(timesheet.start_time);
        const currentTime = new Date();
        const diffMs = currentTime.getTime() - startTime.getTime();
        const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
        
        calculatedHours = diffHours;
        
        // Calcolo approssimativo per straordinari (se > 8 ore)
        if (diffHours > 8) {
          calculatedOvertimeHours = diffHours - 8;
        }
        
        // Calcolo per ore notturne (se inizia prima delle 6 o dopo le 22)
        const startHour = startTime.getHours();
        if (startHour < 6 || startHour >= 22) {
          calculatedNightHours = diffHours;
        }
        
        console.log(`🔍 REAL-TIME CALC per ${timesheet.profiles.first_name}:`, {
          id: timesheet.id,
          start_time: timesheet.start_time,
          hours_worked: calculatedHours.toFixed(2),
          overtime: calculatedOvertimeHours.toFixed(2),
          night: calculatedNightHours.toFixed(2)
        });
      }
      
      employee.total_hours += calculatedHours;
      employee.overtime_hours += calculatedOvertimeHours;
      employee.night_hours += calculatedNightHours;
      
      if (timesheet.meal_voucher_earned) employee.meal_vouchers += 1;
      if (timesheet.is_saturday) employee.saturday_hours += calculatedHours;
      if (timesheet.is_holiday) employee.holiday_hours += calculatedHours;
    });

    return Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
  };

  const employeeSummaries = aggregateTimesheetsByEmployee();

  // Aggrega i dati per vista settimanale
  const aggregateWeeklyData = (): EmployeeWeeklyData[] => {
    const baseDate = parseISO(dateFilter);
    const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6)
    });

    console.log(`🔍 WeekDays:`, weekDays.map(d => format(d, 'yyyy-MM-dd')));
    console.log(`🔍 FilteredTimesheets:`, filteredTimesheets.length, filteredTimesheets.map(t => ({
      id: t.id,
      date: t.date,
      start_time: t.start_time,
      end_time: t.end_time,
      user_id: t.user_id
    })));

    const employeesMap = new Map<string, EmployeeWeeklyData>();

    filteredTimesheets.forEach(timesheet => {
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
             total_hours: 0,
             overtime_hours: 0,
             night_hours: 0,
             meal_vouchers: 0,
             timesheets: [],
             absences: absences.filter(absence => 
               absence.user_id === timesheet.user_id && 
               absence.date === format(day, 'yyyy-MM-dd')
             )
           })),
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        });
      }

      const employee = employeesMap.get(key)!;
      
      // Aggiungi il timesheet al giorno di inizio
      const startDayIndex = weekDays.findIndex(day => 
        format(day, 'yyyy-MM-dd') === timesheet.date
      );

      console.log(`🔍 TIMESHEET DEBUG - ID: ${timesheet.id}, Date: ${timesheet.date}, StartTime: ${timesheet.start_time}`);
      console.log(`🔍 WEEK DAYS:`, weekDays.map(d => format(d, 'yyyy-MM-dd')));
      console.log(`🔍 START DAY INDEX:`, startDayIndex);

      if (startDayIndex !== -1) {
        const dayData = employee.days[startDayIndex];
        console.log(`🔍 ADDING TIMESHEET TO DAY ${dayData.date}:`, timesheet.id);
        // Per timesheet in corso, calcola le ore in tempo reale
        const hoursToAdd = timesheet.total_hours || 0;
        const overtimeToAdd = timesheet.overtime_hours || 0;
        const nightToAdd = timesheet.night_hours || 0;
        
        dayData.total_hours += hoursToAdd;
        dayData.overtime_hours += overtimeToAdd;
        dayData.night_hours += nightToAdd;
        if (timesheet.meal_voucher_earned) dayData.meal_vouchers += 1;
        dayData.timesheets.push(timesheet);
        console.log(`🔍 DAY ${dayData.date} NOW HAS ${dayData.timesheets.length} TIMESHEETS`);
      } else {
        console.log(`🔍 TIMESHEET ${timesheet.id} NOT ADDED - NO MATCHING DAY FOUND`);
      }

      // Per timesheet multi-giorno, aggiungi anche al giorno di fine se diverso
      if (timesheet.end_date && timesheet.end_date !== timesheet.date) {
        const endDayIndex = weekDays.findIndex(day => 
          format(day, 'yyyy-MM-dd') === timesheet.end_date
        );

        if (endDayIndex !== -1 && endDayIndex !== startDayIndex) {
          const endDayData = employee.days[endDayIndex];
          // Non duplicare le ore totali, aggiungi solo il timesheet per la visualizzazione
          endDayData.timesheets.push(timesheet);
        }
      }

      employee.total_hours += timesheet.total_hours || 0;
      employee.overtime_hours += timesheet.overtime_hours || 0;
      employee.night_hours += timesheet.night_hours || 0;
      if (timesheet.meal_voucher_earned) employee.meal_vouchers += 1;
    });

    // Aggiungi dipendenti che hanno solo assenze (nessun timesheet)
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
            total_hours: 0,
            overtime_hours: 0,
            night_hours: 0,
            meal_vouchers: 0,
            timesheets: [],
            absences: absences.filter(abs => 
              abs.user_id === absence.user_id && 
              abs.date === format(day, 'yyyy-MM-dd')
            )
          })),
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        });
      }
    });

    return Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
  };

  // Aggrega i dati per vista mensile
  const aggregateMonthlyData = (): EmployeeMonthlyData[] => {
    const baseDate = parseISO(dateFilter);
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    const monthDays = eachDayOfInterval({
      start: monthStart,
      end: monthEnd
    });

    const employeesMap = new Map<string, EmployeeMonthlyData>();

    // Aggiungi timesheet
    filteredTimesheets.forEach(timesheet => {
      if (!timesheet.profiles) return;

      const key = timesheet.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: timesheet.user_id,
          first_name: timesheet.profiles.first_name,
          last_name: timesheet.profiles.last_name,
          email: timesheet.profiles.email,
          days: monthDays.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            total_hours: 0,
            overtime_hours: 0,
            night_hours: 0,
            meal_vouchers: 0,
            timesheets: [],
            absences: absences.filter(absence => 
              absence.user_id === timesheet.user_id && 
              absence.date === format(day, 'yyyy-MM-dd')
            )
          })),
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        });
      }

      const employee = employeesMap.get(key)!;
      const dayIndex = monthDays.findIndex(day => 
        format(day, 'yyyy-MM-dd') === timesheet.date
      );

      if (dayIndex !== -1) {
        const dayData = employee.days[dayIndex];
        dayData.total_hours += timesheet.total_hours || 0;
        dayData.overtime_hours += timesheet.overtime_hours || 0;
        dayData.night_hours += timesheet.night_hours || 0;
        if (timesheet.meal_voucher_earned) dayData.meal_vouchers += 1;
        dayData.timesheets.push(timesheet);
      }

      employee.total_hours += timesheet.total_hours || 0;
      employee.overtime_hours += timesheet.overtime_hours || 0;
      employee.night_hours += timesheet.night_hours || 0;
      if (timesheet.meal_voucher_earned) employee.meal_vouchers += 1;
    });

    // Aggiungi dipendenti che hanno solo assenze (nessun timesheet)
    absences.forEach(absence => {
      if (!absence.profiles) return;

      const key = absence.user_id;
      
      // Se l'employee non esiste ancora, crealo
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: absence.user_id,
          first_name: absence.profiles.first_name,
          last_name: absence.profiles.last_name,
          email: absence.profiles.email,
          days: monthDays.map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            total_hours: 0,
            overtime_hours: 0,
            night_hours: 0,
            meal_vouchers: 0,
            timesheets: [],
            absences: absences.filter(abs => 
              abs.user_id === absence.user_id && 
              abs.date === format(day, 'yyyy-MM-dd')
            )
          })),
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          meal_vouchers: 0
        });
      }
    });

    return Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
  };

  // Filtra assenze in base ai filtri selezionati
  const filteredAbsences = useMemo(() => {
    return absences.filter(absence => {
      // Filtro per data
      const absenceDate = parseISO(absence.date);
      const filterDate = parseISO(dateFilter);
      
      let dateMatches = false;
      switch (activeView) {
        case 'daily':
          dateMatches = isSameDay(absenceDate, filterDate);
          break;
        case 'weekly':
          const weekStart = startOfWeek(filterDate, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(filterDate, { weekStartsOn: 1 });
          dateMatches = absenceDate >= weekStart && absenceDate <= weekEnd;
          break;
        case 'monthly':
          const monthStart = startOfMonth(filterDate);
          const monthEnd = endOfMonth(filterDate);
          dateMatches = absenceDate >= monthStart && absenceDate <= monthEnd;
          break;
        default:
          dateMatches = true;
      }
      
      if (!dateMatches) return false;

      // Filtro per dipendente
      if (selectedEmployee !== 'all' && absence.user_id !== selectedEmployee) {
        return false;
      }

      // Filtro per termine di ricerca
      if (searchTerm) {
        const fullName = `${absence.profiles?.first_name} ${absence.profiles?.last_name}`.toLowerCase();
        if (!fullName.includes(searchTerm.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [absences, dateFilter, activeView, selectedEmployee, searchTerm]);

  const weeklyData = useMemo(() => aggregateWeeklyData(), [filteredTimesheets, dateFilter, absences]);
  const monthlyData = useMemo(() => aggregateMonthlyData(), [filteredTimesheets, dateFilter, absences]);

  const exportData = () => {
    // TODO: Implementare export
    toast({
      title: "Export",
      description: "Funzionalità di export in sviluppo",
    });
  };

  const handleEditTimesheet = (timesheetId: string) => {
    const timesheet = timesheets.find(t => t.id === timesheetId);
    if (timesheet) {
      setEditingTimesheet(timesheet);
      setEditDialogOpen(true);
    }
  };

  const handleEditTimesheetFromTimeline = (timesheet: TimesheetWithProfile) => {
    setEditingTimesheet(timesheet);
    setEditDialogOpen(true);
  };

  const handleEditSuccess = () => {
    loadTimesheets();
    setEditingTimesheet(null);
  };

  const handleAddTimesheet = (date?: Date) => {
    setSelectedDateForDialog(date);
    setTimesheetInsertDialogOpen(true);
  };

  const handleAddAbsence = (date?: Date) => {
    setSelectedDateForDialog(date);
    setAbsenceInsertDialogOpen(true);
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = parseISO(dateFilter);
    let newDate: Date;

    switch (activeView) {
      case 'daily':
        newDate = direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1);
        break;
      case 'weekly':
        newDate = direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1);
        break;
      default:
        return;
    }

    setDateFilter(format(newDate, 'yyyy-MM-dd'));
  };

  const goToToday = () => {
    setDateFilter(format(new Date(), 'yyyy-MM-dd'));
  };

  const getTodayButtonText = () => {
    switch (activeView) {
      case 'daily':
        return 'Oggi';
      case 'weekly':
        return 'Questa settimana';
      case 'monthly':
        return 'Questo mese';
      default:
        return 'Oggi';
    }
  };

  const getDateRangeText = () => {
    const baseDate = parseISO(dateFilter);
    
    switch (activeView) {
      case 'daily':
        return format(baseDate, 'dd/MM/yyyy', { locale: it });
      case 'weekly':
        const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
        return `${format(weekStart, 'dd/MM', { locale: it })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: it })}`;
      case 'monthly':
        return format(baseDate, 'MMMM yyyy', { locale: it });
      default:
        return '';
    }
  };

  const getNavigationTooltip = (direction: 'prev' | 'next') => {
    const action = direction === 'prev' ? 'Precedente' : 'Successivo';
    switch (activeView) {
      case 'daily':
        return `${action} giorno`;
      case 'weekly':
        return `${action} settimana`;
      case 'monthly':
        return `${action} mese`;
      default:
        return action;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Timesheets</h2>
          <p className="text-muted-foreground">
            Visualizza e modifica i timesheet di tutti i dipendenti
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleAddTimesheet()}
            className="flex items-center gap-2"
            variant="default"
          >
            <Plus className="h-4 w-4" />
            Nuova Timbratura
          </Button>
          <Button
            onClick={() => handleAddAbsence()}
            className="flex items-center gap-2"
            variant="secondary"
          >
            <UserPlus className="h-4 w-4" />
            Inserisci Assenza
          </Button>
          <Button onClick={exportData} className="flex items-center gap-2" variant="outline">
            <Download className="h-4 w-4" />
            Esporta
          </Button>
        </div>
      </div>

      {/* Tabs per vista */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Vista Giornaliera</TabsTrigger>
          <TabsTrigger value="weekly">Vista Settimanale</TabsTrigger>
          <TabsTrigger value="monthly">Vista Mensile</TabsTrigger>
        </TabsList>

        {/* Filtri */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data</label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateDate('prev')}
                    title={getNavigationTooltip('prev')}
                    className="h-10 w-10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "flex-1 justify-start text-left font-normal h-10",
                          !dateFilter && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {getDateRangeText()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={parseISO(dateFilter)}
                        onSelect={(date) => {
                          if (date) {
                            setDateFilter(format(date, 'yyyy-MM-dd'));
                          }
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateDate('next')}
                    title={getNavigationTooltip('next')}
                    className="h-10 w-10"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Dipendente</label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti i dipendenti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i dipendenti</SelectItem>
                    {employees.map((employee) => (
                      <SelectItem key={employee.user_id} value={employee.user_id}>
                        {employee.first_name} {employee.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Commessa</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tutte le commesse" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le commesse</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ricerca</label>
                <Input
                  placeholder="Cerca dipendente o commessa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={loadTimesheets} className="flex-1">
                  Aggiorna
                </Button>
                <Button variant="default" onClick={goToToday} className="flex-1">
                  {getTodayButtonText()}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contenuto per ogni vista */}
        <TabsContent value="daily">
          <EmployeeSummaryTable 
            employeeSummaries={employeeSummaries} 
            loading={loading} 
            onEdit={handleEditTimesheet}
            onDelete={deleteTimesheet}
          />
        </TabsContent>
        
        <TabsContent value="weekly">
          <WeeklyView 
            weeklyData={weeklyData} 
            loading={loading} 
            dateFilter={dateFilter}
            onEdit={handleEditTimesheet}
            onDelete={deleteTimesheet}
            onTimesheetClick={handleEditTimesheetFromTimeline}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
          />
        </TabsContent>
        
        <TabsContent value="monthly">
          <MonthlyView 
            monthlyData={monthlyData} 
            loading={loading} 
            dateFilter={dateFilter}
            onEdit={handleEditTimesheet}
            onDelete={deleteTimesheet}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
          />
        </TabsContent>
      </Tabs>

      <TimesheetEditDialog
        timesheet={editingTimesheet}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />

      <TimesheetInsertDialog
        open={timesheetInsertDialogOpen}
        onOpenChange={setTimesheetInsertDialogOpen}
        onSuccess={loadTimesheets}
        selectedDate={selectedDateForDialog}
      />

      <AbsenceInsertDialog
        open={absenceInsertDialogOpen}
        onOpenChange={setAbsenceInsertDialogOpen}
        onSuccess={loadTimesheets}
        selectedDate={selectedDateForDialog}
      />
    </div>
  );
}

// Componente tabella riassunto dipendenti
function EmployeeSummaryTable({ 
  employeeSummaries, 
  loading, 
  onEdit,
  onDelete
}: { 
  employeeSummaries: EmployeeSummary[]; 
  loading: boolean; 
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const toggleEmployee = (userId: string) => {
    const newExpanded = new Set(expandedEmployees);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedEmployees(newExpanded);
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="h-6 w-6 animate-spin mr-2" />
            Caricamento timesheet...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Riepilogo Dipendenti ({employeeSummaries.length})
        </CardTitle>
        <CardDescription>
          Totali per dipendente con dettaglio espandibile
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {employeeSummaries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun timesheet trovato per i filtri selezionati
            </div>
          ) : (
            employeeSummaries.map((employee) => (
              <Collapsible key={employee.user_id}>
                <CollapsibleTrigger asChild>
                  <div 
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary/70 cursor-pointer transition-colors"
                    onClick={() => toggleEmployee(employee.user_id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedEmployees.has(employee.user_id) ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                      <div>
                        <div className="font-medium text-foreground">
                          {employee.first_name} {employee.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {employee.email}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <div className="font-medium text-foreground">{formatHours(employee.total_hours - employee.overtime_hours)}</div>
                        <div className="text-muted-foreground">Ordinarie</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{formatHours(employee.overtime_hours)}</div>
                        <div className="text-muted-foreground">Straord.</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{formatHours(employee.total_hours)}</div>
                        <div className="text-muted-foreground">Totali</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{formatHours(employee.night_hours)}</div>
                        <div className="text-muted-foreground">Nott.</div>
                      </div>
                      <div className="text-center">
                        <div className="font-medium text-foreground">{employee.meal_vouchers}</div>
                        <div className="text-muted-foreground">Buoni</div>
                      </div>
                      {employee.saturday_hours > 0 && (
                        <div className="text-center">
                          <div className="font-medium text-foreground">{formatHours(employee.saturday_hours)}</div>
                          <div className="text-muted-foreground">Sabato</div>
                        </div>
                      )}
                      {employee.holiday_hours > 0 && (
                        <div className="text-center">
                          <div className="font-medium text-foreground">{formatHours(employee.holiday_hours)}</div>
                          <div className="text-muted-foreground">Festivo</div>
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
              <CollapsibleContent>
                 <div className="mt-2 ml-6">
                   <TimesheetDetailsTable 
                     timesheets={employee.timesheets} 
                     onEdit={(id) => {
                       console.log('EmployeeSummaryTable - Edit timesheet:', id);
                       onEdit(id);
                     }}
                     onDelete={(id) => {
                       console.log('EmployeeSummaryTable - Delete timesheet:', id);
                       onDelete(id);
                     }} 
                   />
                 </div>
              </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Componente vista settimanale
function WeeklyView({ 
  weeklyData, 
  loading, 
  dateFilter,
  onEdit,
  onDelete,
  onTimesheetClick,
  onAddTimesheet,
  onAddAbsence
}: { 
  weeklyData: EmployeeWeeklyData[]; 
  loading: boolean; 
  dateFilter: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTimesheetClick: (timesheet: TimesheetWithProfile) => void;
  onAddTimesheet: (date: Date) => void;
  onAddAbsence: (date: Date) => void;
}) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());

  const toggleEmployee = (userId: string) => {
    const newExpanded = new Set(expandedEmployees);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedEmployees(newExpanded);
  };

  const formatHours = (hours: number) => {
    if (hours === 0) return '-';
    return `${hours.toFixed(1)}h`;
  };

  const baseDate = parseISO(dateFilter);
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 6)
  });

  const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="h-6 w-6 animate-spin mr-2" />
            Caricamento timesheet...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Collect all timesheets for each employee
  const getAllTimesheetsForEmployee = (employee: EmployeeWeeklyData): TimesheetWithProfile[] => {
    const allTimesheets: TimesheetWithProfile[] = [];
    console.log(`🔍 Getting timesheets for employee ${employee.first_name} ${employee.last_name}:`);
    employee.days.forEach(day => {
      console.log(`🔍 Day ${day.date}: ${day.timesheets.length} timesheets`, day.timesheets.map(t => ({
        id: t.id,
        start_time: t.start_time,
        end_time: t.end_time
      })));
      allTimesheets.push(...day.timesheets);
    });
    console.log(`🔍 Total timesheets for ${employee.first_name}: ${allTimesheets.length}`);
    return allTimesheets;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Vista Settimanale - {format(weekStart, 'dd/MM')} - {format(addDays(weekStart, 6), 'dd/MM/yyyy')}
        </CardTitle>
        <CardDescription>
          Ore per giorno della settimana ({weeklyData.length} dipendenti)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {weeklyData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun timesheet trovato per la settimana selezionata
          </div>
        ) : (
          <div className="space-y-2">
            {weeklyData.map((employee) => (
              <Collapsible key={employee.user_id}>
                <CollapsibleTrigger asChild>
                  <div 
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg hover:bg-secondary/70 cursor-pointer transition-colors"
                    onClick={() => toggleEmployee(employee.user_id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedEmployees.has(employee.user_id) ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                      <div>
                        <div className="font-medium text-foreground">
                          {employee.first_name} {employee.last_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {employee.email}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 overflow-x-auto">
                      {employee.days.map((day, index) => (
                        <div key={day.date} className="text-center min-w-[60px] group relative">
                          <div className="text-xs text-muted-foreground">{dayNames[index]}</div>
                           <div className="space-y-1">
                              <div className="text-xs">
                                <span className="text-muted-foreground">Ord:</span> {(() => {
                                  const regularHours = day.total_hours - day.overtime_hours;
                                  if (regularHours > 0) return formatHours(regularHours);
                                  
                                  // Se ci sono timesheet in corso, calcola ore in tempo reale
                                  const ongoingTimesheet = day.timesheets.find(ts => !ts.end_time && ts.start_time);
                                  if (ongoingTimesheet) {
                                    const startTime = new Date(ongoingTimesheet.start_time!);
                                    const currentTime = new Date();
                                    const diffMs = currentTime.getTime() - startTime.getTime();
                                    const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
                                    return formatHours(Math.min(diffHours, 8)); // Max 8h per ore ordinarie
                                  }
                                  
                                  return day.timesheets.length > 0 ? '0h' : '-';
                                })()}
                              </div>
                             {day.overtime_hours > 0 && (
                               <div className="text-xs text-orange-600">
                                 <span className="text-muted-foreground">Str:</span> {formatHours(day.overtime_hours)}
                               </div>
                             )}
                             <div className="text-sm font-semibold border-t pt-1">
                               {day.total_hours > 0 ? formatHours(day.total_hours) : (day.timesheets.length > 0 ? (
                                 day.timesheets.some(t => !t.end_time) ? (
                                   <span className="text-blue-600">In corso</span>
                                 ) : '0h'
                               ) : '-')}
                             </div>
                             {day.absences && day.absences.length > 0 && (
                               <div className="mt-1">
                                 <AbsenceIndicator absences={day.absences} className="justify-center" />
                               </div>
                             )}
                           </div>
                           <DayActionMenu
                             onAddTimesheet={() => onAddTimesheet(parseISO(day.date))}
                             onAddAbsence={() => onAddAbsence(parseISO(day.date))}
                           />
                        </div>
                      ))}
                      <div className="text-center min-w-[100px] bg-secondary/50 px-2 py-1 rounded">
                        <div className="text-xs text-muted-foreground mb-1">Totale Settimana</div>
                        <div className="space-y-1">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Ord:</span> {(() => {
                              const totalRegularHours = employee.total_hours - employee.overtime_hours;
                              
                              // Calcola ore ordinarie in tempo reale per timesheet in corso
                              let realtimeRegularHours = 0;
                              employee.days.forEach(day => {
                                const ongoingTimesheet = day.timesheets.find(ts => !ts.end_time && ts.start_time);
                                if (ongoingTimesheet) {
                                  const startTime = new Date(ongoingTimesheet.start_time!);
                                  const currentTime = new Date();
                                  const diffMs = currentTime.getTime() - startTime.getTime();
                                  const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
                                  realtimeRegularHours += Math.min(diffHours, 8); // Max 8h per ore ordinarie
                                }
                              });
                              
                              return formatHours(totalRegularHours + realtimeRegularHours);
                            })()}
                          </div>
                          <div className="text-xs">
                            <span className="text-muted-foreground">Str:</span> {(() => {
                              let totalOvertimeHours = employee.overtime_hours;
                              
                              // Calcola straordinari in tempo reale per timesheet in corso
                              employee.days.forEach(day => {
                                const ongoingTimesheet = day.timesheets.find(ts => !ts.end_time && ts.start_time);
                                if (ongoingTimesheet) {
                                  const startTime = new Date(ongoingTimesheet.start_time!);
                                  const currentTime = new Date();
                                  const diffMs = currentTime.getTime() - startTime.getTime();
                                  const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
                                  if (diffHours > 8) {
                                    totalOvertimeHours += (diffHours - 8);
                                  }
                                }
                              });
                              
                              return formatHours(totalOvertimeHours);
                            })()}
                          </div>
                          <div className="font-semibold text-sm border-t pt-1">
                            <span className="text-muted-foreground">Tot:</span> {(() => {
                              let totalHours = employee.total_hours;
                              
                              // Calcola ore totali in tempo reale per timesheet in corso
                              employee.days.forEach(day => {
                                const ongoingTimesheet = day.timesheets.find(ts => !ts.end_time && ts.start_time);
                                if (ongoingTimesheet) {
                                  const startTime = new Date(ongoingTimesheet.start_time!);
                                  const currentTime = new Date();
                                  const diffMs = currentTime.getTime() - startTime.getTime();
                                  const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
                                  totalHours += diffHours;
                                }
                              });
                              
                              return formatHours(totalHours);
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 ml-6">
                    <TimesheetTimeline 
                      timesheets={getAllTimesheetsForEmployee(employee)} 
                      weekDays={weekDays}
                      onTimesheetClick={onTimesheetClick}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Componente vista mensile
function MonthlyView({ 
  monthlyData, 
  loading, 
  dateFilter,
  onEdit,
  onDelete,
  onAddTimesheet,
  onAddAbsence
}: { 
  monthlyData: EmployeeMonthlyData[]; 
  loading: boolean; 
  dateFilter: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddTimesheet: (date: Date) => void;
  onAddAbsence: (date: Date) => void;
}) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<Map<string, string>>(new Map()); // Map<employeeId, selectedDate>
  const [employeeSettings, setEmployeeSettings] = useState<Map<string, any>>(new Map());
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    loadEmployeeSettings();
  }, [monthlyData]);

  const loadEmployeeSettings = async () => {
    if (monthlyData.length === 0) return;

    try {
      // Carica le impostazioni aziendali
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();

      if (companyError && companyError.code !== 'PGRST116') {
        console.error('Error loading company settings:', companyError);
      } else {
        setCompanySettings(companyData);
      }

      // Ottieni tutti gli user_id unici
      const userIds = [...new Set(monthlyData.map(emp => emp.user_id))];

      // Carica le impostazioni specifiche dei dipendenti (ordinata per updated_at DESC)
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .in('user_id', userIds)
        .order('updated_at', { ascending: false });

      if (employeeError) {
        console.error('Error loading employee settings:', employeeError);
      } else {
        const settingsMap = new Map();
        // Prendi solo il più recente per ogni user_id
        const latestSettings = new Map();
        employeeData?.forEach(setting => {
          if (!latestSettings.has(setting.user_id)) {
            latestSettings.set(setting.user_id, setting);
          }
        });
        latestSettings.forEach((setting, userId) => {
          settingsMap.set(userId, setting);
        });
        setEmployeeSettings(settingsMap);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const toggleEmployee = (userId: string) => {
    const newExpanded = new Set(expandedEmployees);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
      // Reset selected day when collapsing
      const newSelectedDays = new Map(selectedDays);
      newSelectedDays.delete(userId);
      setSelectedDays(newSelectedDays);
    } else {
      newExpanded.add(userId);
    }
    setExpandedEmployees(newExpanded);
  };

  const selectDayForEmployee = (employeeId: string, date: string) => {
    const newSelectedDays = new Map(selectedDays);
    newSelectedDays.set(employeeId, date);
    setSelectedDays(newSelectedDays);
    
    // Expand the employee if not already expanded
    if (!expandedEmployees.has(employeeId)) {
      const newExpanded = new Set(expandedEmployees);
      newExpanded.add(employeeId);
      setExpandedEmployees(newExpanded);
    }
  };

  const formatHours = (hours: number) => {
    if (hours === 0) return '-';
    return `${hours.toFixed(1)}h`;
  };

  const getBenefitDisplay = (employee: EmployeeMonthlyData, dayData: DailyHours) => {
    const employeeSetting = employeeSettings.get(employee.user_id);
    
    // Determina la policy effettiva (employee settings hanno priorità su company settings)
    let effectivePolicy = employeeSetting?.meal_allowance_policy || companySettings?.meal_allowance_policy || 'disabled';
    
    if (effectivePolicy === 'both') {
      // Per policy "both", verifica entrambi i benefici
      const dailyAllowanceMinHours = employeeSetting?.daily_allowance_min_hours || companySettings?.default_daily_allowance_min_hours || 6;
      const dailyAllowanceAmount = employeeSetting?.daily_allowance_amount || companySettings?.default_daily_allowance_amount || 10.00;
      
      const hasMealVoucher = dayData.meal_vouchers > 0;
      const hasDailyAllowance = dayData.total_hours >= dailyAllowanceMinHours;
      
      if (hasMealVoucher && hasDailyAllowance) {
        return { show: true, icon: '🍽️💰', tooltip: `Buono Pasto + Indennità: €${dailyAllowanceAmount.toFixed(2)}` };
      } else if (hasMealVoucher) {
        return { show: true, icon: '🍽️', tooltip: 'Buono Pasto Maturato' };
      } else if (hasDailyAllowance) {
        return { show: true, icon: '💰', tooltip: `Indennità: €${dailyAllowanceAmount.toFixed(2)}` };
      }
      
      return { show: false, icon: '', tooltip: '' };
    }
    
    // Se meal_vouchers > 0, significa che nel database è stato calcolato un buono pasto/benefit
    // Ma dobbiamo verificare se la policy corrente prevede buoni pasto o indennità
    if (dayData.meal_vouchers > 0) {
      switch (effectivePolicy) {
        case 'meal_vouchers_only':
          return { show: true, icon: '🍽️', tooltip: 'Buono Pasto Maturato' };
          
        case 'daily_allowance':
          // Per indennità, calcola l'importo
          const dailyAllowanceAmount = employeeSetting?.daily_allowance_amount || companySettings?.daily_allowance_amount || 10.00;
          return { show: true, icon: '💰', tooltip: `Indennità: €${dailyAllowanceAmount.toFixed(2)}` };
          
        case 'disabled':
        default:
          return { show: false, icon: '', tooltip: '' };
      }
    }
    
    return { show: false, icon: '', tooltip: '' };
  };

  const baseDate = parseISO(dateFilter);
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const monthDays = eachDayOfInterval({
    start: monthStart,
    end: monthEnd
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Clock className="h-6 w-6 animate-spin mr-2" />
            Caricamento timesheet...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Collect all timesheets for each employee or for a specific day
  const getTimesheetsForEmployee = (employee: EmployeeMonthlyData, specificDate?: string): TimesheetWithProfile[] => {
    if (specificDate) {
      const dayData = employee.days.find(day => day.date === specificDate);
      return dayData ? dayData.timesheets : [];
    }
    
    const allTimesheets: TimesheetWithProfile[] = [];
    employee.days.forEach(day => {
      allTimesheets.push(...day.timesheets);
    });
    return allTimesheets;
  };

  // Raggruppa i giorni in settimane per una migliore visualizzazione
  const weeks = [];
  let currentWeek = [];
  let weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  
  monthDays.forEach((day, index) => {
    if (currentWeek.length === 0) {
      weekStart = startOfWeek(day, { weekStartsOn: 1 });
    }
    
    currentWeek.push(day);
    
    if (currentWeek.length === 7 || index === monthDays.length - 1) {
      weeks.push({
        start: weekStart,
        days: [...currentWeek]
      });
      currentWeek = [];
    }
  });

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Vista Mensile - {format(monthStart, 'MMMM yyyy', { locale: it })}
          </CardTitle>
          <CardDescription>
            Ore per giorno del mese ({monthlyData.length} dipendenti)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        {monthlyData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun timesheet trovato per il mese selezionato
          </div>
        ) : (
          monthlyData.map((employee) => (
            <Collapsible key={employee.user_id}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-secondary/50 transition-colors">
                  <CardHeader className="pb-3" onClick={() => toggleEmployee(employee.user_id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedEmployees.has(employee.user_id) ? 
                          <ChevronDown className="h-4 w-4" /> : 
                          <ChevronRight className="h-4 w-4" />
                        }
                        <div>
                          <CardTitle className="text-lg">
                            {employee.first_name} {employee.last_name}
                          </CardTitle>
                          <CardDescription>{employee.email}</CardDescription>
                        </div>
                      </div>
                       <div className="text-right">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <div className="text-lg font-semibold">{formatHours(employee.total_hours - employee.overtime_hours)}</div>
                            <div className="text-xs text-muted-foreground">Ordinarie</div>
                          </div>
                          <div>
                            <div className="text-lg font-semibold">{formatHours(employee.overtime_hours)}</div>
                            <div className="text-xs text-muted-foreground">Straord.</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold">{formatHours(employee.total_hours)}</div>
                            <div className="text-xs text-muted-foreground">Totali</div>
                          </div>
                        </div>
                       </div>
                    </div>
                      {employee.meal_vouchers > 0 && (
                        <div className="flex gap-4 text-sm ml-7">
                          <span className="text-muted-foreground">
                            {(() => {
                              const employeeSetting = employeeSettings.get(employee.user_id);
                              const effectivePolicy = employeeSetting?.meal_allowance_policy || companySettings?.meal_allowance_policy || 'disabled';
                              
                              switch (effectivePolicy) {
                                case 'meal_vouchers_only':
                                case 'meal_vouchers_always':
                                  return `Buoni pasto: ${employee.meal_vouchers}`;
                                case 'daily_allowance':
                                  const dailyAllowanceAmount = employeeSetting?.daily_allowance_amount || companySettings?.daily_allowance_amount || 10.00;
                                  const totalAmount = (employee.meal_vouchers * dailyAllowanceAmount).toFixed(2);
                                  return `Indennità giornaliera: €${totalAmount} (${employee.meal_vouchers} giorni)`;
                                case 'disabled':
                                default:
                                  return `Benefits: ${employee.meal_vouchers}`;
                              }
                            })()}
                          </span>
                        </div>
                      )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3 ml-7">
                      {weeks.map((week, weekIndex) => (
                        <div key={weekIndex}>
                          <div className="text-xs text-muted-foreground mb-1">
                            Settimana {format(week.start, 'dd/MM')} - {format(addDays(week.start, 6), 'dd/MM')}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {week.days.map((day) => {
                              const dayData = employee.days.find(d => d.date === format(day, 'yyyy-MM-dd'));
                              const isToday = isSameDay(day, new Date());
                              
                              return (
                                <div 
                                  key={day.toISOString()}
                                  className={`
                                    group relative p-2 text-center border rounded-sm min-h-[60px] flex flex-col justify-center cursor-pointer
                                    hover:bg-secondary/50 transition-colors
                                    ${isToday ? 'bg-primary/10 border-primary' : 'bg-secondary/30 border-border'}
                                    ${dayData && dayData.total_hours > 0 ? 'bg-success/10 hover:bg-success/20' : ''}
                                    ${selectedDays.get(employee.user_id) === format(day, 'yyyy-MM-dd') ? 'ring-2 ring-primary bg-primary/20' : ''}
                                  `}
                                  onClick={() => dayData && dayData.total_hours > 0 && selectDayForEmployee(employee.user_id, format(day, 'yyyy-MM-dd'))}
                                >
                                  <div className="text-xs font-medium mb-1">
                                    {format(day, 'dd')}
                                  </div>
                                   {dayData && dayData.total_hours > 0 ? (
                                     <div className="space-y-1">
                                       <Tooltip>
                                         <TooltipTrigger asChild>
                                           <div className="text-xs">
                                             <span className="text-muted-foreground">O:</span> {formatHours(dayData.total_hours - dayData.overtime_hours)}
                                           </div>
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Ore Ordinarie</p>
                                         </TooltipContent>
                                       </Tooltip>
                                       {dayData.overtime_hours > 0 && (
                                         <Tooltip>
                                           <TooltipTrigger asChild>
                                             <div className="text-xs text-orange-600">
                                               <span className="text-muted-foreground">S:</span> {formatHours(dayData.overtime_hours)}
                                             </div>
                                           </TooltipTrigger>
                                           <TooltipContent>
                                             <p>Ore Straordinarie</p>
                                           </TooltipContent>
                                         </Tooltip>
                                       )}
                                       <Tooltip>
                                         <TooltipTrigger asChild>
                                           <div className="text-xs font-semibold border-t pt-1">
                                             {formatHours(dayData.total_hours)}
                                           </div>
                                         </TooltipTrigger>
                                         <TooltipContent>
                                           <p>Ore Totali Giornata</p>
                                         </TooltipContent>
                                       </Tooltip>
                                         {(() => {
                                           const benefit = getBenefitDisplay(employee, dayData);
                                           return benefit.show && (
                                             <Tooltip>
                                               <TooltipTrigger asChild>
                                                 <div className="text-xs">{benefit.icon}</div>
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>{benefit.tooltip}</p>
                                               </TooltipContent>
                                             </Tooltip>
                                           );
                                         })()}
                                        {dayData.absences && dayData.absences.length > 0 && (
                                          <div className="mt-1">
                                            <AbsenceIndicator absences={dayData.absences} className="justify-center" />
                                          </div>
                                        )}
                                      </div>
                                   ) : (
                                     <div className="text-xs text-muted-foreground">
                                       {dayData && dayData.absences && dayData.absences.length > 0 ? '' : '-'}
                                     </div>
                                   )}
                                   {dayData && dayData.absences && dayData.absences.length > 0 && (
                                     <div className="mt-1">
                                       <AbsenceIndicator absences={dayData.absences} className="justify-center" />
                                     </div>
                                   )}
                                  <div className="absolute top-1 right-1">
                                    <DayActionMenu
                                      onAddTimesheet={() => onAddTimesheet(day)}
                                      onAddAbsence={() => onAddAbsence(day)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 ml-6">
                  {selectedDays.has(employee.user_id) ? (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">
                        Dettagli per {format(parseISO(selectedDays.get(employee.user_id)!), 'dd/MM/yyyy', { locale: it })}
                      </h4>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const newSelectedDays = new Map(selectedDays);
                          newSelectedDays.delete(employee.user_id);
                          setSelectedDays(newSelectedDays);
                        }}
                        className="mb-2"
                      >
                        Mostra tutto il mese
                      </Button>
                    </div>
                  ) : null}
                  <TimesheetDetailsTable 
                    timesheets={getTimesheetsForEmployee(employee, selectedDays.get(employee.user_id))} 
                    onEdit={onEdit}
                    onDelete={onDelete} 
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}

// Componente tabella dettagli timesheet
function TimesheetDetailsTable({ 
  timesheets, 
  onEdit,
  onDelete
}: { 
  timesheets: TimesheetWithProfile[]; 
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [employeeSettings, setEmployeeSettings] = useState<Map<string, any>>(new Map());
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    loadEmployeeSettings();
  }, [timesheets]);

  const loadEmployeeSettings = async () => {
    if (timesheets.length === 0) return;

    try {
      // Carica le impostazioni aziendali
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();

      if (companyError && companyError.code !== 'PGRST116') {
        console.error('Error loading company settings:', companyError);
      } else {
        setCompanySettings(companyData);
      }

      // Ottieni tutti gli user_id unici
      const userIds = [...new Set(timesheets.map(t => t.user_id))];

      // Carica le impostazioni specifiche dei dipendenti
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .in('user_id', userIds);

      if (employeeError) {
        console.error('Error loading employee settings:', employeeError);
      } else {
        const settingsMap = new Map();
        employeeData?.forEach(setting => {
          settingsMap.set(setting.user_id, setting);
        });
        setEmployeeSettings(settingsMap);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    return format(parseISO(timeString), 'HH:mm');
  };

  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };

  const getOrdinaryHours = (timesheet: TimesheetWithProfile) => {
    const totalHours = timesheet.total_hours || 0;
    const overtimeHours = timesheet.overtime_hours || 0;
    return totalHours - overtimeHours;
  };

  const getLunchBreakDisplay = (timesheet: TimesheetWithProfile) => {
    // CORREZIONE: Per timesheet aperti (senza end_time) non mostrare pausa pranzo predefinita
    if (!timesheet.end_time) {
      return 'In corso...';
    }

    // Se ha orari specifici di pausa pranzo, mostrali
    if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
      return `${formatTime(timesheet.lunch_start_time)} - ${formatTime(timesheet.lunch_end_time)}`;
    }

    // Se ha una durata personalizzata, mostrala
    if (timesheet.lunch_duration_minutes !== null) {
      if (timesheet.lunch_duration_minutes === 0) {
        return 'Nessuna pausa';
      }
      return `${timesheet.lunch_duration_minutes} min`;
    }

    // Altrimenti mostra la pausa configurata dalle impostazioni
    const employeeSetting = employeeSettings.get(timesheet.user_id);
    let lunchBreakType = null;

    if (employeeSetting?.lunch_break_type) {
      lunchBreakType = employeeSetting.lunch_break_type;
    } else if (companySettings?.lunch_break_type) {
      lunchBreakType = companySettings.lunch_break_type;
    }

    if (lunchBreakType) {
      switch (lunchBreakType) {
        case '0_minuti': return 'Nessuna pausa';
        case '15_minuti': return '15 min';
        case '30_minuti': return '30 min';
        case '45_minuti': return '45 min';
        case '60_minuti': return '1 ora';
        case '90_minuti': return '1h 30min';
        case '120_minuti': return '2 ore';
        default: return '1 ora'; // Default
      }
    }

    return '1 ora'; // Fallback
  };

  const getBenefitDisplay = (timesheet: TimesheetWithProfile) => {
    const employeeSetting = employeeSettings.get(timesheet.user_id);
    
    // Determina la policy effettiva (employee settings hanno priorità su company settings)
    let effectivePolicy = employeeSetting?.meal_allowance_policy || companySettings?.meal_allowance_policy || 'disabled';
    
    // Se meal_voucher_earned è true, significa che nel database è stato calcolato un buono pasto
    // Ma dobbiamo verificare se la policy corrente prevede buoni pasto o indennità
    switch (effectivePolicy) {
      case 'meal_vouchers_only':
      case 'meal_vouchers_always':
        return timesheet.meal_voucher_earned ? 'Buono: Sì' : 'Buono: No';
        
      case 'daily_allowance':
        // Per indennità, mostra l'importo se il dipendente ha lavorato abbastanza ore
        const dailyAllowanceAmount = employeeSetting?.daily_allowance_amount || companySettings?.daily_allowance_amount || 10.00;
        const minHours = employeeSetting?.daily_allowance_min_hours || companySettings?.daily_allowance_min_hours || 6;
        const totalHours = timesheet.total_hours || 0;
        
        if (totalHours >= minHours) {
          return `Indennità: €${dailyAllowanceAmount.toFixed(2)}`;
        } else {
          return `Indennità: No (< ${minHours}h)`;
        }
        
      case 'disabled':
      default:
        return 'Nessuno';
    }
  };

  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Commessa</TableHead>
              <TableHead>Entrata</TableHead>
              <TableHead>Uscita</TableHead>
              <TableHead>Pausa Pranzo</TableHead>
              <TableHead>Ore Totali</TableHead>
              <TableHead>Ore Ordinarie</TableHead>
              <TableHead>Straordinari</TableHead>
              <TableHead>Notturno</TableHead>
              <TableHead>Posizioni GPS</TableHead>
              <TableHead>Benefit</TableHead>
              <TableHead>Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timesheets.map((timesheet) => (
              <TableRow key={timesheet.id}>
                <TableCell className="font-medium">
                  {format(parseISO(timesheet.date), 'dd/MM/yyyy', { locale: it })}
                </TableCell>
                <TableCell>{timesheet.projects?.name || 'Nessuna'}</TableCell>
                <TableCell>{formatTime(timesheet.start_time)}</TableCell>
                <TableCell>{formatTime(timesheet.end_time)}</TableCell>
                <TableCell>
                  {getLunchBreakDisplay(timesheet)}
                </TableCell>
                <TableCell><HoursDisplay timesheet={timesheet} /></TableCell>
                <TableCell className="font-medium">
                  {formatHours(getOrdinaryHours(timesheet))}
                </TableCell>
                <TableCell>{formatHours(timesheet.overtime_hours)}</TableCell>
                <TableCell>{formatHours(timesheet.night_hours)}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <LocationDisplay
                      startLat={timesheet.start_location_lat}
                      startLng={timesheet.start_location_lng}
                      endLat={timesheet.end_location_lat}
                      endLng={timesheet.end_location_lng}
                      compact
                    />
                    {/* Add tracking indicator - this will be populated when data exists */}
                    <LocationTrackingIndicator timesheetId={timesheet.id} />
                  </div>
                </TableCell>
                <TableCell>
                  {getBenefitDisplay(timesheet)}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(timesheet.id)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(timesheet.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}