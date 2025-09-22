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
import { CalendarIcon, Clock, Edit, Filter, Download, Users, ChevronDown, ChevronRight, Trash2, Navigation, ChevronLeft, Plus, UserPlus, Calendar, FileSpreadsheet } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, addDays, isSameDay, subDays, subWeeks, subMonths, addWeeks, addMonths } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { OvertimeTracker } from '@/components/OvertimeTracker';
import { TimesheetTimeline } from '@/components/TimesheetTimeline';
import { TimesheetEditDialog } from '@/components/TimesheetEditDialog';
import { TimesheetInsertDialog } from '@/components/TimesheetInsertDialog';
import { AbsenceInsertDialog } from '@/components/AbsenceInsertDialog';
import { DayActionMenu } from '@/components/DayActionMenu';
import { AbsenceIndicator } from '@/components/AbsenceIndicator';
import LocationDisplay from '@/components/LocationDisplay';
import { useRealtimeHours } from '@/hooks/use-realtime-hours';
import { calcNightMinutesLocal } from '@/utils/nightHours';
import { getEmployeeSettingsForDate } from '@/utils/temporalEmployeeSettings';
import { TimesheetWithProfile } from '@/types/timesheet';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BenefitsService } from '@/services/BenefitsService';
import { TimesheetDebugPanel } from '@/components/debug/TimesheetDebugPanel';
import { MonthlyCalendarView } from '@/components/MonthlyCalendarView';
import { WeeklyTimelineView } from '@/components/WeeklyTimelineView';
import { TimesheetImportDialog } from '@/components/TimesheetImportDialog';

// Componente per mostrare ore con calcolo in tempo reale
function HoursDisplay({ timesheet }: { timesheet: TimesheetWithProfile }) {
  const realtimeHours = useRealtimeHours(timesheet);
  const [rtNightHours, setRtNightHours] = useState<number>(0);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!timesheet.start_time || timesheet.end_time) {
        setRtNightHours(0);
        return;
      }
      const settings = await getEmployeeSettingsForDate(timesheet.user_id, timesheet.date);
      const ns = settings?.night_shift_start || '22:00:00';
      const ne = settings?.night_shift_end || '05:00:00';
      const start = new Date(timesheet.start_time);
      const now = new Date();
      const mins = calcNightMinutesLocal(start, now, ns, ne, 'Europe/Rome');
      if (active) setRtNightHours(mins / 60);
    };

    run();

    // recalculate every minute while shift is open
    const id = setInterval(run, 60_000);
    return () => { active = false; clearInterval(id); };
  }, [timesheet.start_time, timesheet.end_time, timesheet.user_id, timesheet.date]);
  
  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };
  
  if (!timesheet.end_time && timesheet.start_time) {
    return (
      <span className="text-blue-600">
        {formatHours(realtimeHours)} (in corso)
        {rtNightHours > 0 && (
          <span className="text-xs text-blue-700 ml-1">
            • notturne {rtNightHours.toFixed(1)}h
          </span>
        )}
      </span>
    );
  }
  
  return (
    <span>
      {formatHours(timesheet.total_hours)}
      {timesheet.night_hours && timesheet.night_hours > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          • notturne {timesheet.night_hours.toFixed(1)}h
        </span>
      )}
    </span>
  );
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
  
  // Stati per i filtri
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Funzioni per navigazione date
  const navigateToToday = () => {
    setDateFilter(format(new Date(), 'yyyy-MM-dd'));
  };

  const navigatePrevious = () => {
    const currentDate = parseISO(dateFilter);
    let newDate: Date;
    switch (activeView) {
      case 'weekly':
        newDate = subWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = subMonths(currentDate, 1);
        break;
      default: // daily
        newDate = subDays(currentDate, 1);
    }
    setDateFilter(format(newDate, 'yyyy-MM-dd'));
  };

  const navigateNext = () => {
    const currentDate = parseISO(dateFilter);
    let newDate: Date;
    switch (activeView) {
      case 'weekly':
        newDate = addWeeks(currentDate, 1);
        break;
      case 'monthly':
        newDate = addMonths(currentDate, 1);
        break;
      default: // daily
        newDate = addDays(currentDate, 1);
    }
    setDateFilter(format(newDate, 'yyyy-MM-dd'));
  };

  // Stati per i dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetWithProfile | null>(null);
  const [selectedTimesheetDate, setSelectedTimesheetDate] = useState<string>('');

  // Funzioni per aggiungere timesheet e assenze da specifici giorni
  const handleAddTimesheet = (date: string, userId: string) => {
    setSelectedTimesheetDate(date);
    setSelectedEmployee(userId); // Imposta l'utente selezionato
    setInsertDialogOpen(true);
  };

  const handleAddAbsence = (date: string, userId: string) => {
    setSelectedTimesheetDate(date);
    setSelectedEmployee(userId); // Imposta l'utente selezionato  
    setAbsenceDialogOpen(true);
  };

  // Stati per le impostazioni
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [employeeSettings, setEmployeeSettings] = useState<{[key: string]: any}>({});

  // Trigger per aggiornamenti in tempo reale
  const [realtimeUpdateTrigger, setRealtimeUpdateTrigger] = useState(0);

  // Aggiorna automaticamente ogni minuto per mantenere il calcolo ore in tempo reale
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimeUpdateTrigger(prev => prev + 1);
    }, 60000); // Aggiorna ogni minuto

    return () => clearInterval(interval);
  }, []);

  // Setup realtime subscription for timesheets
  useEffect(() => {
    const channel = supabase
      .channel('admin-timesheets-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'timesheets'
        },
        () => {
          console.log('🔄 Ricaricamento timesheets per cambio real-time');
          loadTimesheets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadEmployees();
      loadProjects();
      loadSettings();
      loadTimesheets();
    }
  }, [user, selectedEmployee, selectedProject, dateFilter, activeView]);

  // Forza il re-render per aggiornare le ore in tempo reale
  useEffect(() => {
    // Questo effect viene triggerato ogni minuto per aggiornare le ore in tempo reale
  }, [realtimeUpdateTrigger]);

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('first_name');

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dipendenti",
        variant: "destructive",
      });
    }
  };

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei progetti",
        variant: "destructive",
      });
    }
  };

  const loadSettings = async () => {
    try {
      // Load company settings
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (!companyError && companyData) {
        setCompanySettings(companyData);
      }

      // Load employee settings for all employees
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*');
      
      if (!employeeError && employeeData) {
        const settingsMap = employeeData.reduce((acc, setting) => {
          acc[setting.user_id] = setting;
          return acc;
        }, {} as {[key: string]: any});
        setEmployeeSettings(settingsMap);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Get meal benefits for a timesheet using centralized temporal calculation
  const getMealBenefits = async (timesheet: TimesheetWithProfile) => {
    const employeeSettingsForUser = employeeSettings[timesheet.user_id];
    BenefitsService.validateTemporalUsage('AdminTimesheets.getMealBenefits');
    return await BenefitsService.calculateMealBenefits(
      timesheet, 
      employeeSettingsForUser, 
      companySettings,
      timesheet.date
    );
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

  // Aggrega i dati per dipendente per la vista giornaliera
  const aggregateTimesheetsByEmployee = async (): Promise<EmployeeSummary[]> => {
    console.log('🔍 aggregateTimesheetsByEmployee - starting...');
    const employeesMap = new Map<string, EmployeeSummary>();

    await Promise.all(filteredTimesheets.map(async (timesheet) => {
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

      // Calcola le ore (con tempo reale per timesheet aperti)
      let calculatedHours = 0;
      let calculatedOvertimeHours = 0;
      let calculatedNightHours = 0;

      if (timesheet.end_time) {
        // Timesheet chiuso - usa i valori salvati
        calculatedHours = timesheet.total_hours || 0;
        calculatedOvertimeHours = timesheet.overtime_hours || 0;
        calculatedNightHours = timesheet.night_hours || 0;
      } else if (timesheet.start_time) {
        // Timesheet aperto - calcola in tempo reale
        const startTime = new Date(timesheet.start_time);
        const currentTime = new Date();
        const diffMs = currentTime.getTime() - startTime.getTime();
        calculatedHours = Math.max(0, diffMs / (1000 * 60 * 60));
        
        // Calcolo straordinari (oltre 8 ore)
        if (calculatedHours > 8) {
          calculatedOvertimeHours = calculatedHours - 8;
        }
        
        // Calcolo ore notturne (se inizia prima delle 6 o dopo le 22) - usando UTC+1 (Europa/Roma)
        const startHour = startTime.getUTCHours() + 1; // Convert UTC to Europe/Rome timezone
        const adjustedStartHour = startHour >= 24 ? startHour - 24 : (startHour < 0 ? startHour + 24 : startHour);
        if (adjustedStartHour < 6 || adjustedStartHour >= 22) {
          calculatedNightHours = calculatedHours;
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

      // Calcola buoni pasto
      const mealBenefits = await getMealBenefits(timesheet);
      if (mealBenefits.mealVoucher) {
        employee.meal_vouchers += 1;
      }

      // Calcola ore sabato/festivi
      if (timesheet.is_saturday) employee.saturday_hours += calculatedHours;
      if (timesheet.is_holiday) employee.holiday_hours += calculatedHours;
    }));

    const result = Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );

    console.log('🔍 aggregateTimesheetsByEmployee - result:', result);
    console.log('🔍 aggregateTimesheetsByEmployee - result is array?', Array.isArray(result));
    
    return result;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-center">Caricamento...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Timesheet</h2>
          <p className="text-muted-foreground">
            Visualizza e gestisci i timesheet di tutti i dipendenti
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setInsertDialogOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuovo Timesheet
          </Button>
          <Button 
            variant="outline"
            onClick={() => setAbsenceDialogOpen(true)}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Aggiungi Assenza
          </Button>
          <Button 
            variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importa Excel
          </Button>
        </div>
      </div>

      {/* Controlli filtri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filtro dipendente */}
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

            {/* Filtro progetto */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Progetto</label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutti i progetti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i progetti</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro data */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Data</label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFilter && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(parseISO(dateFilter), 'dd/MM/yyyy', { locale: it }) : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFilter ? parseISO(dateFilter) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setDateFilter(format(date, 'yyyy-MM-dd'));
                        setIsCalendarOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Ricerca */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Ricerca</label>
              <Input
                placeholder="Cerca dipendente o progetto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs per le diverse viste */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'daily' | 'weekly' | 'monthly')}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Vista Giornaliera</TabsTrigger>
          <TabsTrigger value="weekly">Vista Settimanale</TabsTrigger>
          <TabsTrigger value="monthly">Vista Mensile</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-6">
          <DailySummaryView 
            timesheets={filteredTimesheets}
            absences={absences}
            aggregateTimesheetsByEmployee={aggregateTimesheetsByEmployee}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditTimesheet={(timesheet) => {
              setEditingTimesheet(timesheet);
              setEditDialogOpen(true);
            }}
            onDeleteTimesheet={deleteTimesheet}
          />
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <WeeklyTimelineView 
            timesheets={filteredTimesheets}
            absences={absences}
            dateFilter={dateFilter}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditTimesheet={(timesheet) => {
              setEditingTimesheet(timesheet);
              setEditDialogOpen(true);
            }}
            onDeleteTimesheet={deleteTimesheet}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          <MonthlyCalendarView 
            timesheets={filteredTimesheets}
            absences={absences}
            dateFilter={dateFilter}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditTimesheet={(timesheet) => {
              setEditingTimesheet(timesheet);
              setEditDialogOpen(true);
            }}
            onDeleteTimesheet={deleteTimesheet}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog per modifica */}
      <TimesheetEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        timesheet={editingTimesheet}
        onSuccess={() => {
          loadTimesheets();
          setEditDialogOpen(false);
          setEditingTimesheet(null);
        }}
      />

      {/* Dialog per inserimento */}
      <TimesheetInsertDialog
        open={insertDialogOpen}
        onOpenChange={setInsertDialogOpen}
        selectedDate={selectedTimesheetDate ? parseISO(selectedTimesheetDate) : new Date()}
        onSuccess={() => {
          loadTimesheets();
          setInsertDialogOpen(false);
        }}
      />

      {/* Dialog per inserimento assenza */}
      <AbsenceInsertDialog
        open={absenceDialogOpen}
        onOpenChange={setAbsenceDialogOpen}
        onSuccess={() => {
          loadTimesheets(); // Ricarica anche le assenze
          setAbsenceDialogOpen(false);
        }}
      />

      {/* Dialog per importazione Excel */}
      <TimesheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          loadTimesheets();
        }}
      />
    </div>
  );
}

// Vista riassuntiva giornaliera
function DailySummaryView({ 
  timesheets, 
  absences,
  aggregateTimesheetsByEmployee,
  employeeSettings,
  companySettings,
  onEditTimesheet,
  onDeleteTimesheet 
}: {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  aggregateTimesheetsByEmployee: () => Promise<EmployeeSummary[]>;
  employeeSettings: any;
  companySettings: any;
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
}) {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mealBenefitsCache, setMealBenefitsCache] = useState<{[key: string]: any}>({});

  useEffect(() => {
    console.log('🔍 DailySummaryView - useEffect triggered');
    
    const loadEmployeeData = async () => {
      setLoading(true);
      console.log('🔍 DailySummaryView - calling aggregateTimesheetsByEmployee...');
      
      try {
        const employeeData = await aggregateTimesheetsByEmployee();
        console.log('🔍 DailySummaryView - got employee data:', employeeData);
        console.log('🔍 DailySummaryView - employee data is array?', Array.isArray(employeeData));
        
        setEmployees(employeeData);
        
        // Pre-calculate meal benefits for all timesheets to use in rendering
        const benefitsCache: {[key: string]: any} = {};
        
        for (const employee of employeeData) {
          for (const timesheet of employee.timesheets) {
            const benefits = await BenefitsService.calculateMealBenefits(
              timesheet, 
              employeeSettings[timesheet.user_id], 
              companySettings,
              timesheet.date
            );
            benefitsCache[timesheet.id] = benefits;
          }
        }
        
        setMealBenefitsCache(benefitsCache);
        console.log('🔍 DailySummaryView - finished loading employee data');
      } catch (error) {
        console.error('❌ DailySummaryView - Error loading employee data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEmployeeData();
  }, [timesheets, employeeSettings, companySettings]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">Caricamento...</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Riepilogo Giornaliero
        </CardTitle>
        <CardDescription>
          Visualizzazione aggregata per dipendente
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {employees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun timesheet trovato per i criteri selezionati
            </div>
          ) : (
            <div className="space-y-4">
              {employees.map((employee) => (
                <Card key={employee.user_id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {employee.first_name} {employee.last_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">{employee.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {employee.total_hours.toFixed(1)}h totali
                        </Badge>
                        {employee.overtime_hours > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            {employee.overtime_hours.toFixed(1)}h straord.
                          </Badge>
                        )}
                        {employee.night_hours > 0 && (
                          <Badge variant="outline" className="text-blue-600 border-blue-200">
                            {employee.night_hours.toFixed(1)}h notturne
                          </Badge>
                        )}
                        {employee.meal_vouchers > 0 && (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            {employee.meal_vouchers} buoni pasto
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                          <span className="text-sm text-muted-foreground">
                            Dettagli timesheet ({employee.timesheets.length} voci)
                          </span>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-2 mt-4">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Progetto</TableHead>
                                <TableHead>Orario</TableHead>
                                <TableHead>Ore</TableHead>
                                <TableHead>Buoni Pasto</TableHead>
                                <TableHead>Posizione</TableHead>
                                <TableHead>Azioni</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {employee.timesheets.map((timesheet) => {
                                const mealBenefits = mealBenefitsCache[timesheet.id] || { mealVoucher: false, dailyAllowance: false };
                                
                                return (
                                  <TableRow key={timesheet.id}>
                                    <TableCell className="font-medium">
                                      {format(parseISO(timesheet.date), 'dd/MM/yyyy', { locale: it })}
                                      {(timesheet.is_saturday || timesheet.is_holiday) && (
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {timesheet.is_holiday ? 'Festivo' : 'Sabato'}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {timesheet.projects ? timesheet.projects.name : 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                          <span>{timesheet.start_time ? format(parseISO(timesheet.start_time), 'HH:mm') : '-'}</span>
                                          <span>→</span>
                                          <span>{timesheet.end_time ? format(parseISO(timesheet.end_time), 'HH:mm') : 'In corso'}</span>
                                          {!timesheet.end_time && (
                                            <Badge variant="secondary" className="text-xs">ATTIVO</Badge>
                                          )}
                                        </div>
                                        {timesheet.lunch_start_time && timesheet.lunch_end_time && (
                                          <div className="text-xs text-muted-foreground">
                                            Pausa: {format(parseISO(timesheet.lunch_start_time), 'HH:mm')} - {format(parseISO(timesheet.lunch_end_time), 'HH:mm')}
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <div className="font-medium">
                                          <HoursDisplay timesheet={timesheet} />
                                        </div>
                                        {timesheet.overtime_hours && timesheet.overtime_hours > 0 && (
                                          <div className="text-xs text-orange-600">
                                            +{timesheet.overtime_hours.toFixed(1)}h straord.
                                          </div>
                                        )}
                                        {timesheet.night_hours && timesheet.night_hours > 0 && (
                                          <div className="text-xs text-blue-600">
                                            {timesheet.night_hours.toFixed(1)}h notturne
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        {mealBenefits.mealVoucher && (
                                          <Badge variant="secondary" className="text-xs">Buono</Badge>
                                        )}
                                        {mealBenefits.dailyAllowance && (
                                          <Badge variant="outline" className="text-xs">Indennità</Badge>
                                        )}
                                        {!mealBenefits.mealVoucher && !mealBenefits.dailyAllowance && (
                                          <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <LocationDisplay 
                                        startLat={timesheet.start_location_lat}
                                        startLng={timesheet.start_location_lng}
                                        endLat={timesheet.end_location_lat}
                                        endLng={timesheet.end_location_lng}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onEditTimesheet(timesheet)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onDeleteTimesheet(timesheet.id)}
                                          className="text-red-600 hover:text-red-700"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Mostra le assenze per questo dipendente */}
                    {absences.filter(absence => absence.user_id === employee.user_id).length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <h4 className="font-medium text-sm mb-2">Assenze</h4>
                        <div className="space-y-1">
                          {absences
                            .filter(absence => absence.user_id === employee.user_id)
                            .map((absence) => (
                              <div key={absence.id} className="flex items-center gap-2 text-sm">
                                <AbsenceIndicator absences={[absence]} />
                                <span className="text-muted-foreground">
                                  {format(parseISO(absence.date), 'dd/MM/yyyy', { locale: it })}
                                </span>
                                {absence.notes && (
                                  <span className="text-muted-foreground">- {absence.notes}</span>
                                )}
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}