import { useState, useEffect } from 'react';
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
import { CalendarIcon, Clock, Edit, Filter, Download, Users, ChevronDown, ChevronRight, Trash2, Navigation } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, addDays, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { OvertimeTracker } from '@/components/OvertimeTracker';
import { TimesheetTimeline } from '@/components/TimesheetTimeline';
import LocationTrackingIndicator from '@/components/LocationTrackingIndicator';
import { TimesheetEditDialog } from '@/components/TimesheetEditDialog';
import LocationDisplay from '@/components/LocationDisplay';
import { useRealtimeHours } from '@/hooks/use-realtime-hours';
import { TimesheetWithProfile } from '@/types/timesheet';

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
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  // Edit dialog state
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetWithProfile | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Filtri
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadTimesheets();
  }, [selectedEmployee, selectedProject, dateFilter, activeView]);

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
      employee.total_hours += timesheet.total_hours || 0;
      employee.overtime_hours += timesheet.overtime_hours || 0;
      employee.night_hours += timesheet.night_hours || 0;
      if (timesheet.meal_voucher_earned) employee.meal_vouchers += 1;
      if (timesheet.is_saturday) employee.saturday_hours += timesheet.total_hours || 0;
      if (timesheet.is_holiday) employee.holiday_hours += timesheet.total_hours || 0;
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
            timesheets: []
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

      if (startDayIndex !== -1) {
        const dayData = employee.days[startDayIndex];
        dayData.total_hours += timesheet.total_hours || 0;
        dayData.overtime_hours += timesheet.overtime_hours || 0;
        dayData.night_hours += timesheet.night_hours || 0;
        if (timesheet.meal_voucher_earned) dayData.meal_vouchers += 1;
        dayData.timesheets.push(timesheet);
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
            timesheets: []
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

    return Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
  };

  const weeklyData = aggregateWeeklyData();
  const monthlyData = aggregateMonthlyData();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Timesheets</h2>
          <p className="text-muted-foreground">
            Visualizza e modifica i timesheet di tutti i dipendenti
          </p>
        </div>
        <Button onClick={exportData} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Esporta
        </Button>
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
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
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

              <div className="flex items-end">
                <Button variant="outline" onClick={loadTimesheets} className="w-full">
                  Aggiorna
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
          />
        </TabsContent>
        
        <TabsContent value="monthly">
          <MonthlyView 
            monthlyData={monthlyData} 
            loading={loading} 
            dateFilter={dateFilter}
            onEdit={handleEditTimesheet}
            onDelete={deleteTimesheet}
          />
        </TabsContent>
      </Tabs>

      <TimesheetEditDialog
        timesheet={editingTimesheet}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
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
  onTimesheetClick
}: { 
  weeklyData: EmployeeWeeklyData[]; 
  loading: boolean; 
  dateFilter: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTimesheetClick: (timesheet: TimesheetWithProfile) => void;
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
    employee.days.forEach(day => {
      allTimesheets.push(...day.timesheets);
    });
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
                        <div key={day.date} className="text-center min-w-[60px]">
                          <div className="text-xs text-muted-foreground">{dayNames[index]}</div>
                          <div className="space-y-1">
                            <div className="text-xs">
                              <span className="text-muted-foreground">Ord:</span> {formatHours(day.total_hours - day.overtime_hours)}
                            </div>
                            {day.overtime_hours > 0 && (
                              <div className="text-xs text-orange-600">
                                <span className="text-muted-foreground">Str:</span> {formatHours(day.overtime_hours)}
                              </div>
                            )}
                            <div className="text-sm font-semibold border-t pt-1">
                              {formatHours(day.total_hours)}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="text-center min-w-[100px] bg-secondary/50 px-2 py-1 rounded">
                        <div className="text-xs text-muted-foreground mb-1">Totale Settimana</div>
                        <div className="space-y-1">
                          <div className="text-xs">
                            <span className="text-muted-foreground">Ord:</span> {formatHours(employee.total_hours - employee.overtime_hours)}
                          </div>
                          <div className="text-xs">
                            <span className="text-muted-foreground">Str:</span> {formatHours(employee.overtime_hours)}
                          </div>
                          <div className="font-semibold text-sm border-t pt-1">
                            <span className="text-muted-foreground">Tot:</span> {formatHours(employee.total_hours)}
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
  onDelete
}: { 
  monthlyData: EmployeeMonthlyData[]; 
  loading: boolean; 
  dateFilter: string;
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
    if (hours === 0) return '-';
    return `${hours.toFixed(1)}h`;
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

  // Collect all timesheets for each employee
  const getAllTimesheetsForEmployee = (employee: EmployeeMonthlyData): TimesheetWithProfile[] => {
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
                           Buoni pasto: {employee.meal_vouchers}
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
                                    p-2 text-center border rounded-sm min-h-[60px] flex flex-col justify-center
                                    ${isToday ? 'bg-primary/10 border-primary' : 'bg-secondary/30 border-border'}
                                    ${dayData && dayData.total_hours > 0 ? 'bg-success/10' : ''}
                                  `}
                                >
                                  <div className="text-xs font-medium mb-1">
                                    {format(day, 'dd')}
                                  </div>
                                   {dayData && dayData.total_hours > 0 ? (
                                     <div className="space-y-1">
                                       <div className="text-xs">
                                         <span className="text-muted-foreground">O:</span> {formatHours(dayData.total_hours - dayData.overtime_hours)}
                                       </div>
                                       {dayData.overtime_hours > 0 && (
                                         <div className="text-xs text-orange-600">
                                           <span className="text-muted-foreground">S:</span> {formatHours(dayData.overtime_hours)}
                                         </div>
                                       )}
                                       <div className="text-xs font-semibold border-t pt-1">
                                         {formatHours(dayData.total_hours)}
                                       </div>
                                       {dayData.meal_vouchers > 0 && (
                                         <div className="text-xs">🍽️</div>
                                       )}
                                     </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">-</div>
                                  )}
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
                  <TimesheetDetailsTable 
                    timesheets={getAllTimesheetsForEmployee(employee)} 
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
              <TableHead>Buono Pasto</TableHead>
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
                  {timesheet.meal_voucher_earned ? 'Sì' : 'No'}
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