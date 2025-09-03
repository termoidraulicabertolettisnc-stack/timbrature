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
import { CalendarIcon, Clock, Edit, Filter, Download, Users } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { OvertimeTracker } from '@/components/OvertimeTracker';

interface TimesheetWithProfile {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  night_hours: number | null;
  is_saturday: boolean;
  is_holiday: boolean;
  meal_voucher_earned: boolean;
  notes: string | null;
  user_id: string;
  project_id: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string | null;
  start_location_lat: number | null;
  start_location_lng: number | null;
  end_location_lat: number | null;
  end_location_lng: number | null;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  projects: {
    name: string;
  } | null;
}

export default function AdminTimesheets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [timesheets, setTimesheets] = useState<TimesheetWithProfile[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
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

  const exportData = () => {
    // TODO: Implementare export
    toast({
      title: "Export",
      description: "Funzionalità di export in sviluppo",
    });
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
          <TimesheetsTable 
            timesheets={filteredTimesheets} 
            loading={loading} 
            onEdit={(id) => console.log('Edit timesheet:', id)}
          />
        </TabsContent>
        
        <TabsContent value="weekly">
          <TimesheetsTable 
            timesheets={filteredTimesheets} 
            loading={loading} 
            onEdit={(id) => console.log('Edit timesheet:', id)}
          />
        </TabsContent>
        
        <TabsContent value="monthly">
          <TimesheetsTable 
            timesheets={filteredTimesheets} 
            loading={loading} 
            onEdit={(id) => console.log('Edit timesheet:', id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente tabella timesheets
function TimesheetsTable({ 
  timesheets, 
  loading, 
  onEdit 
}: { 
  timesheets: TimesheetWithProfile[]; 
  loading: boolean; 
  onEdit: (id: string) => void;
}) {
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
          Timesheet ({timesheets.length})
        </CardTitle>
        <CardDescription>
          Elenco completo dei timesheet con possibilità di modifica
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Dipendente</TableHead>
                <TableHead>Commessa</TableHead>
                <TableHead>Entrata</TableHead>
                <TableHead>Uscita</TableHead>
                <TableHead>Pausa Pranzo</TableHead>
                <TableHead>Ore Totali</TableHead>
                <TableHead>Straordinari</TableHead>
                <TableHead>Notturno</TableHead>
                <TableHead>Extra</TableHead>
                <TableHead>Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timesheets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    Nessun timesheet trovato per i filtri selezionati
                  </TableCell>
                </TableRow>
              ) : (
                timesheets.map((timesheet) => (
                  <TableRow key={timesheet.id}>
                    <TableCell className="font-medium">
                      {format(parseISO(timesheet.date), 'dd/MM/yyyy', { locale: it })}
                    </TableCell>
                    <TableCell>{getEmployeeName(timesheet)}</TableCell>
                    <TableCell>{timesheet.projects?.name || 'Nessuna'}</TableCell>
                    <TableCell>{formatTime(timesheet.start_time)}</TableCell>
                    <TableCell>{formatTime(timesheet.end_time)}</TableCell>
                    <TableCell>
                      {timesheet.lunch_start_time && timesheet.lunch_end_time ? 
                        `${formatTime(timesheet.lunch_start_time)} - ${formatTime(timesheet.lunch_end_time)}` : 
                        '-'
                      }
                    </TableCell>
                    <TableCell>{formatHours(timesheet.total_hours)}</TableCell>
                    <TableCell>{formatHours(timesheet.overtime_hours)}</TableCell>
                    <TableCell>{formatHours(timesheet.night_hours)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {timesheet.is_saturday && <Badge variant="secondary">Sab</Badge>}
                        {timesheet.is_holiday && <Badge variant="secondary">Fest</Badge>}
                        {timesheet.meal_voucher_earned && <Badge variant="default">Buono</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(timesheet.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}