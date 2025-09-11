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
import { BenefitsService } from '@/services/BenefitsService';

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
  
  // States for company and employee settings (needed for meal benefit calculations)
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [employeeSettings, setEmployeeSettings] = useState<{[key: string]: any}>({});

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
    loadSettings();
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
  const getMealBenefits = (timesheet: TimesheetWithProfile) => {
    const employeeSettingsForUser = employeeSettings[timesheet.user_id];
    BenefitsService.validateTemporalUsage('AdminTimesheets.getMealBenefits');
    return BenefitsService.calculateMealBenefitsSync(
      timesheet, 
      employeeSettingsForUser, 
      companySettings
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
      
      // Use centralized meal benefit calculation
      const mealBenefits = getMealBenefits(timesheet);
      if (mealBenefits.mealVoucher) employee.meal_vouchers += 1;
      if (timesheet.is_saturday) employee.saturday_hours += calculatedHours;
      if (timesheet.is_holiday) employee.holiday_hours += calculatedHours;
    });

    return Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Timesheet</h2>
          <p className="text-muted-foreground">
            Visualizza e gestisci i timesheet di tutti i dipendenti
          </p>
        </div>
      </div>

      {/* Filtri e controlli */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtri e Controlli
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vista</label>
              <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="daily">Giornaliera</TabsTrigger>
                  <TabsTrigger value="weekly">Settimanale</TabsTrigger>
                  <TabsTrigger value="monthly">Mensile</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data di riferimento</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFilter && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFilter ? format(parseISO(dateFilter), 'PPP', { locale: it }) : <span>Seleziona data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFilter ? parseISO(dateFilter) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setDateFilter(format(date, 'yyyy-MM-dd'));
                      }
                    }}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Dipendente</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona dipendente" />
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
              <label className="text-sm font-medium">Progetto</label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona progetto" />
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Ricerca</label>
              <Input
                type="text"
                placeholder="Cerca per nome o progetto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-end space-x-2">
              <Button onClick={loadTimesheets} className="flex-1">
                Aggiorna
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contenuto principale */}
      {activeView === 'daily' && (
        <DailyView 
          timesheets={filteredTimesheets}
          absences={absences}
          onEditTimesheet={(timesheet) => {
            setEditingTimesheet(timesheet);
            setEditDialogOpen(true);
          }}
          onDeleteTimesheet={deleteTimesheet}
        />
      )}

      {activeView === 'weekly' && (
        <WeeklyView 
          timesheets={filteredTimesheets}
          absences={absences}
          dateFilter={dateFilter}
          employeeSettings={employeeSettings}
          companySettings={companySettings}
        />
      )}

      {activeView === 'monthly' && (
        <MonthlyView 
          timesheets={filteredTimesheets}
          absences={absences}
          dateFilter={dateFilter}
          employeeSettings={employeeSettings}
          companySettings={companySettings}
        />
      )}

      {/* Dialog per modifica */}
      <TimesheetEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        timesheet={editingTimesheet}
        onSave={() => {
          loadTimesheets();
          setEditDialogOpen(false);
          setEditingTimesheet(null);
        }}
      />
    </div>
  );
}

// Vista giornaliera semplificata
function DailyView({ 
  timesheets, 
  absences, 
  onEditTimesheet, 
  onDeleteTimesheet 
}: {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Vista Giornaliera
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timesheets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun timesheet trovato per la data selezionata
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dipendente</TableHead>
                    <TableHead>Progetto</TableHead>
                    <TableHead>Inizio</TableHead>
                    <TableHead>Fine</TableHead>
                    <TableHead>Ore Totali</TableHead>
                    <TableHead>Straordinari</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheets.map((timesheet) => (
                    <TableRow key={timesheet.id}>
                      <TableCell className="font-medium">
                        {timesheet.profiles ? 
                          `${timesheet.profiles.first_name} ${timesheet.profiles.last_name}` : 
                          'N/A'
                        }
                      </TableCell>
                      <TableCell>
                        {timesheet.projects?.name || 'Nessun progetto'}
                      </TableCell>
                      <TableCell>
                        {timesheet.start_time ? 
                          format(parseISO(timesheet.start_time), 'HH:mm') : 
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        {timesheet.end_time ? 
                          format(parseISO(timesheet.end_time), 'HH:mm') : 
                          'In corso'
                        }
                      </TableCell>
                      <TableCell>
                        <HoursDisplay timesheet={timesheet} />
                      </TableCell>
                      <TableCell>
                        {timesheet.overtime_hours ? 
                          `${timesheet.overtime_hours.toFixed(1)}h` : 
                          '0h'
                        }
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {timesheet.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditTimesheet(timesheet)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onDeleteTimesheet(timesheet.id)}
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Vista settimanale semplificata
function WeeklyView({ 
  timesheets, 
  absences, 
  dateFilter, 
  employeeSettings, 
  companySettings 
}: {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  employeeSettings: any;
  companySettings: any;
}) {
  // Implementazione base della vista settimanale
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista Settimanale</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          Vista settimanale semplificata - {timesheets.length} timesheet trovati
        </div>
      </CardContent>
    </Card>
  );
}

// Vista mensile semplificata  
function MonthlyView({ 
  timesheets, 
  absences, 
  dateFilter, 
  employeeSettings, 
  companySettings 
}: {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  employeeSettings: any;
  companySettings: any;
}) {
  // Implementazione base della vista mensile
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista Mensile</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          Vista mensile semplificata - {timesheets.length} timesheet trovati
        </div>
      </CardContent>
    </Card>
  );
}
