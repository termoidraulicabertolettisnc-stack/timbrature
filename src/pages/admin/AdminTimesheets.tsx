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
import { formatInTimeZone } from 'date-fns-tz';
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

// Estende il tipo timesheet per supportare le proprietà delle sessioni multiple
interface ExtendedTimesheetWithProfile extends TimesheetWithProfile {
  session_hours?: number;
  session_type?: string;
  session_notes?: string;
  session_order?: number;
  is_session?: boolean;
  original_timesheet_id?: string;
}
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BenefitsService } from '@/services/BenefitsService';
import { MonthlyCalendarView } from '@/components/MonthlyCalendarView';
import { WeeklyTimelineView } from '@/components/WeeklyTimelineView';
import { TimesheetImportDialog } from '@/components/TimesheetImportDialog';

// CORREZIONE: Funzione per estrarre l'ID reale del timesheet
const extractRealTimesheetId = (compositeId: string): string => {
  console.log('🔧 ID FIX - Input composite ID:', compositeId);
  
  // Se l'ID contiene underscore, è un ID composito generato dal frontend
  if (compositeId.includes('_')) {
    // Estrai la prima parte che è l'UUID reale
    const realId = compositeId.split('_')[0];
    console.log('🔧 ID FIX - Extracted real ID:', realId);
    return realId;
  }
  
  // Se non contiene underscore, è già un ID reale
  console.log('🔧 ID FIX - Already real ID:', compositeId);
  return compositeId;
};

// CORREZIONE: Funzione per gestire correttamente le sessioni multiple
const processTimesheetSessions = (timesheet: TimesheetWithProfile): ExtendedTimesheetWithProfile[] => {
  const sessions: ExtendedTimesheetWithProfile[] = [];
  
  console.log('🔍 SESSIONI MULTIPLE - Processing timesheet:', timesheet.id, 'with sessions:', timesheet.timesheet_sessions);
  
  // Se ha sessioni multiple, processale tutte
  if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
    console.log('🔍 SESSIONI MULTIPLE - Found', timesheet.timesheet_sessions.length, 'sessions');
    
    timesheet.timesheet_sessions.forEach((session, index) => {
      if (session.start_time) {
        const sessionTimesheet: ExtendedTimesheetWithProfile = {
          ...timesheet,
          id: `${timesheet.id}_session_${session.id}_${index}`,
          start_time: session.start_time,
          end_time: session.end_time,
          // Calcola le ore per questa sessione specifica
          session_hours: session.end_time ? 
            ((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / (1000 * 60 * 60)) : 0,
          session_type: session.session_type,
          session_notes: session.notes,
          session_order: session.session_order,
          is_session: true,
          original_timesheet_id: timesheet.id
        };
        
        sessions.push(sessionTimesheet);
        console.log('🔍 SESSIONI MULTIPLE - Added session:', sessionTimesheet.id, 'from', session.start_time, 'to', session.end_time);
      }
    });
  } else {
    // Fallback: usa i dati del timesheet principale se non ci sono sessioni
    if (timesheet.start_time) {
      sessions.push({
        ...timesheet,
        is_session: false,
        session_hours: timesheet.total_hours || 0
      });
      console.log('🔍 SESSIONI MULTIPLE - No sessions found, using main timesheet data');
    }
  }
  
  return sessions;
};

// CORREZIONE: Funzione per visualizzare le ore con sessioni multiple
function HoursDisplayMultiSessionFixed({ session }: { session: any }) {
  const realtimeHours = useRealtimeHours(session);
  const [rtNightHours, setRtNightHours] = useState<number>(0);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!session.start_time || session.end_time) {
        setRtNightHours(0);
        return;
      }
      const settings = await getEmployeeSettingsForDate(session.user_id, session.date);
      const ns = settings?.night_shift_start || '22:00:00';
      const ne = settings?.night_shift_end || '05:00:00';
      const start = new Date(session.start_time);
      const now = new Date();
      const mins = calcNightMinutesLocal(start, now, ns, ne, 'Europe/Rome');
      if (active) setRtNightHours(mins / 60);
    };

    run();
    const id = setInterval(run, 60_000);
    return () => { active = false; clearInterval(id); };
  }, [session.start_time, session.end_time, session.user_id, session.date]);
  
  const formatHours = (hours: number | null) => {
    if (!hours) return '0h';
    return `${hours.toFixed(1)}h`;
  };
  
  if (!session.end_time && session.start_time) {
    return (
      <span className="text-blue-600">
        {formatHours(realtimeHours)} (in corso)
        {rtNightHours > 0 && (
          <span className="text-xs text-blue-700 ml-1">
            • notturne {rtNightHours.toFixed(1)}h
          </span>
        )}
        {session.is_session && (
          <span className="text-xs text-purple-700 ml-1">
            • sessione #{session.session_order || 1}
          </span>
        )}
      </span>
    );
  }
  
  return (
    <span>
      {formatHours(session.session_hours || session.total_hours)}
      {session.night_hours && session.night_hours > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          • notturne {session.night_hours.toFixed(1)}h
        </span>
      )}
      {session.is_session && (
        <Badge variant="outline" className="ml-2 text-xs">
          Sessione #{session.session_order || 1}
          {session.session_type && ` (${session.session_type})`}
        </Badge>
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
  timesheets: ExtendedTimesheetWithProfile[];
}

interface DailyHours {
  date: string;
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  meal_vouchers: number;
  timesheets: ExtendedTimesheetWithProfile[];
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
  const getMealBenefits = (timesheet: TimesheetWithProfile) => {
    const employeeSettingsForUser = employeeSettings[timesheet.user_id];
    BenefitsService.validateTemporalUsage('AdminTimesheets.getMealBenefits');
    return BenefitsService.calculateMealBenefitsSync(
      timesheet, 
      employeeSettingsForUser, 
      companySettings
    );
  };

  const deleteTimesheet = async (compositeId: string) => {
    console.log('🔧 ID FIX - Starting deletion for composite ID:', compositeId);
    
    // CORREZIONE: Estrai l'ID reale
    const realId = extractRealTimesheetId(compositeId);
    console.log('🔧 ID FIX - Using real ID for deletion:', realId);
    
    if (!confirm('Sei sicuro di voler eliminare questo timesheet? Questa azione non può essere annullata.')) {
      return;
    }

    try {
      // Verifica autenticazione
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Utente non autenticato');
      }

      // Controlla se il timesheet esiste
      const { data: existingTimesheet, error: checkError } = await supabase
        .from('timesheets')
        .select('id, user_id')
        .eq('id', realId) // ← FIX: Usa ID reale
        .single();
      
      console.log('🔧 ID FIX - Existing timesheet check:', { data: existingTimesheet, error: checkError });
      
      if (checkError) {
        if (checkError.code === 'PGRST116') {
          throw new Error('Timesheet non trovato');
        } else {
          throw new Error(`Errore nella verifica del timesheet: ${checkError.message}`);
        }
      }

      // Elimina le sessioni collegate
      const { data: sessions, error: sessionsError } = await supabase
        .from('timesheet_sessions')
        .select('id')
        .eq('timesheet_id', realId); // ← FIX: Usa ID reale
      
      if (sessions && sessions.length > 0) {
        console.log('🔧 ID FIX - Deleting sessions first');
        const { error: deleteSessionsError } = await supabase
          .from('timesheet_sessions')
          .delete()
          .eq('timesheet_id', realId); // ← FIX: Usa ID reale
        
        if (deleteSessionsError) {
          throw new Error(`Errore nell'eliminazione delle sessioni: ${deleteSessionsError.message}`);
        }
      }

      // Elimina il timesheet principale
      console.log('🔧 ID FIX - Deleting main timesheet with real ID:', realId);
      const { error: deleteError } = await supabase
        .from('timesheets')
        .delete()
        .eq('id', realId); // ← FIX: Usa ID reale

      if (deleteError) {
        console.error('🔧 ID FIX - Delete error details:', {
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint,
          code: deleteError.code
        });
        throw new Error(`Errore nell'eliminazione: ${deleteError.message}`);
      }

      console.log('🔧 ID FIX - Deletion successful');

      toast({
        title: "Successo",
        description: "Timesheet eliminato con successo",
      });

      // Ricarica i dati
      loadTimesheets();
    } catch (error: any) {
      console.error('🔧 ID FIX - Delete error:', error);
      
      let errorMessage = 'Errore sconosciuto nell\'eliminazione';
      if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Errore",
        description: `Errore nell'eliminazione del timesheet: ${errorMessage}`,
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
          ),
          timesheet_sessions (
            id,
            session_order,
            start_time,
            end_time,
            session_type,
            notes
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

  // CORREZIONE COMPLETA: Funzione aggregazione che considera le sessioni multiple
  const aggregateTimesheetsByEmployeeFixed = (): EmployeeSummary[] => {
    const employeesMap = new Map<string, EmployeeSummary>();
    
    console.log('🔧 DAILY FIX - Starting aggregation with', filteredTimesheets.length, 'timesheets');

    // CORREZIONE: Espandi ogni timesheet nelle sue sessioni
    const allSessions: any[] = [];
    
    filteredTimesheets.forEach(timesheet => {
      console.log('🔧 DAILY FIX - Processing timesheet:', timesheet.id, 'sessions:', timesheet.timesheet_sessions?.length || 0);
      
      if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
        // Ha sessioni multiple - espandi ogni sessione
        timesheet.timesheet_sessions.forEach((session, index) => {
          if (session.start_time) {
            const sessionTimesheet = {
              ...timesheet,
              id: `${timesheet.id}_session_${session.id}_${index}`,
              start_time: session.start_time,
              end_time: session.end_time,
              // Calcola le ore per questa sessione specifica
              session_hours: session.end_time ? 
                ((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / (1000 * 60 * 60)) : 0,
              session_type: session.session_type,
              session_notes: session.notes,
              session_order: session.session_order,
              is_session: true,
              original_timesheet_id: timesheet.id
            };
            
            allSessions.push(sessionTimesheet);
            console.log('🔧 DAILY FIX - Added session:', sessionTimesheet.id, 'from', session.start_time, 'to', session.end_time, 'duration:', sessionTimesheet.session_hours?.toFixed(2) + 'h');
          }
        });
      } else {
        // Nessuna sessione - usa il timesheet principale
        if (timesheet.start_time) {
          const mainTimesheet = {
            ...timesheet,
            is_session: false,
            session_hours: timesheet.total_hours || 0
          };
          allSessions.push(mainTimesheet);
          console.log('🔧 DAILY FIX - Added main timesheet:', timesheet.id, 'duration:', mainTimesheet.session_hours?.toFixed(2) + 'h');
        }
      }
    });
    
    console.log('🔧 DAILY FIX - Total sessions after expansion:', allSessions.length);

    // Raggruppa per dipendente
    allSessions.forEach(session => {
      if (!session.profiles) return;

      const key = session.user_id;
      if (!employeesMap.has(key)) {
        employeesMap.set(key, {
          user_id: session.user_id,
          first_name: session.profiles.first_name,
          last_name: session.profiles.last_name,
          email: session.profiles.email,
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
      employee.timesheets.push(session);

      // Calcola le ore per questa sessione
      let calculatedHours = 0;
      let calculatedOvertimeHours = 0;
      let calculatedNightHours = 0;

      if (session.end_time) {
        // Sessione chiusa - usa le ore calcolate
        calculatedHours = session.session_hours || session.total_hours || 0;
        calculatedOvertimeHours = session.overtime_hours || 0;
        calculatedNightHours = session.night_hours || 0;
      } else if (session.start_time) {
        // Sessione aperta - calcola in tempo reale
        const startTime = new Date(session.start_time);
        const currentTime = new Date();
        const diffMs = currentTime.getTime() - startTime.getTime();
        calculatedHours = Math.max(0, diffMs / (1000 * 60 * 60));
        
        // CORREZIONE: Calcolo straordinari giornalieri, non per singola sessione
        const dailyHours = employee.total_hours + calculatedHours;
        if (dailyHours > 8) {
          // Solo le ore oltre le 8 giornaliere sono straordinari
          calculatedOvertimeHours = Math.max(0, dailyHours - 8 - employee.overtime_hours);
        }
        
        console.log(`🔧 DAILY FIX REAL-TIME - Session ${session.id}:`, {
          start_time: session.start_time,
          hours_worked: calculatedHours.toFixed(2),
          daily_total: dailyHours.toFixed(2),
          overtime: calculatedOvertimeHours.toFixed(2)
        });
      }

      // CORREZIONE: Accumula le ore correttamente
      employee.total_hours += calculatedHours;
      employee.overtime_hours += calculatedOvertimeHours;
      employee.night_hours += calculatedNightHours;

      // Calcola buoni pasto (solo una volta per timesheet principale, non per ogni sessione)
      if (!session.is_session || session.session_order === 1) {
        const mealBenefits = getMealBenefits(session);
        if (mealBenefits.mealVoucher) {
          employee.meal_vouchers += 1;
        }
      }

      // Calcola ore sabato/festivi
      if (session.is_saturday) employee.saturday_hours += calculatedHours;
      if (session.is_holiday) employee.holiday_hours += calculatedHours;
    });

    const result = Array.from(employeesMap.values()).sort((a, b) => 
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );
    
    console.log('🔧 DAILY FIX - Final aggregation:', result.map(emp => ({
      name: `${emp.first_name} ${emp.last_name}`,
      sessions_count: emp.timesheets.length,
      total_hours: emp.total_hours.toFixed(2)
    })));
    
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
          <DailySummaryViewFixed 
            timesheets={filteredTimesheets}
            absences={absences}
            aggregateTimesheetsByEmployee={aggregateTimesheetsByEmployeeFixed}
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

// CORREZIONE: Vista giornaliera aggiornata per gestire le sessioni multiple
function DailySummaryViewFixed({ 
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
  aggregateTimesheetsByEmployee: () => EmployeeSummary[];
  employeeSettings: any;
  companySettings: any;
  onEditTimesheet: (timesheet: TimesheetWithProfile) => void;
  onDeleteTimesheet: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Riepilogo Giornaliero - Tutte le Sessioni
        </CardTitle>
        <CardDescription>
          Visualizzazione aggregata per dipendente con tutte le sessioni multiple
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {aggregateTimesheetsByEmployee().length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun timesheet trovato per i criteri selezionati
            </div>
          ) : (
            <div className="space-y-4">
              {aggregateTimesheetsByEmployee().map((employee) => (
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
                        <Badge variant="outline" className="text-purple-600 border-purple-200">
                          {employee.timesheets.length} sessioni
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
                            Dettagli sessioni ({employee.timesheets.length} voci)
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
                                <TableHead>Tipo</TableHead>
                                <TableHead>Buoni Pasto</TableHead>
                                <TableHead>Posizione</TableHead>
                                <TableHead>Azioni</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {employee.timesheets
                                .sort((a, b) => {
                                  // Prima ordina per data, poi per session_order
                                  const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
                                  if (dateCompare !== 0) return dateCompare;
                                  return (a.session_order || 0) - (b.session_order || 0);
                                })
                                .map((session, index) => {
                                const mealBenefits = BenefitsService.calculateMealBenefitsSync(
                                  session, 
                                  employeeSettings[session.user_id], 
                                  companySettings
                                );
                                
                                // ID originale per le azioni
                                const originalId = session.is_session ? session.original_timesheet_id : session.id;
                                
                                return (
                                  <TableRow key={`${session.id}_${index}`} className={session.is_session ? 'bg-purple-50/50' : ''}>
                                    <TableCell className="font-medium">
                                      {format(parseISO(session.date), 'dd/MM/yyyy', { locale: it })}
                                      {(session.is_saturday || session.is_holiday) && (
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {session.is_holiday ? 'Festivo' : 'Sabato'}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {session.projects ? session.projects.name : 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                          <span>{session.start_time ? formatInTimeZone(parseISO(session.start_time), 'Europe/Rome', 'HH:mm') : '-'}</span>
                                          <span>→</span>
                                          <span>{session.end_time ? formatInTimeZone(parseISO(session.end_time), 'Europe/Rome', 'HH:mm') : 'In corso'}</span>
                                          {!session.end_time && (
                                            <Badge variant="secondary" className="text-xs">ATTIVO</Badge>
                                          )}
                                        </div>
                                        {session.lunch_start_time && session.lunch_end_time && (
                                          <div className="text-xs text-muted-foreground">
                                            Pausa: {formatInTimeZone(parseISO(session.lunch_start_time), 'Europe/Rome', 'HH:mm')} - {formatInTimeZone(parseISO(session.lunch_end_time), 'Europe/Rome', 'HH:mm')}
                                          </div>
                                        )}
                                        {session.session_notes && (
                                          <div className="text-xs text-muted-foreground italic">
                                            {session.session_notes}
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                         <div className="font-medium">
                                           <HoursDisplayMultiSessionFixed session={session} />
                                         </div>
                                        {session.overtime_hours && session.overtime_hours > 0 && (
                                          <div className="text-xs text-orange-600">
                                            +{session.overtime_hours.toFixed(1)}h straord.
                                          </div>
                                        )}
                                        {session.night_hours && session.night_hours > 0 && (
                                          <div className="text-xs text-blue-600">
                                            {session.night_hours.toFixed(1)}h notturne
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {session.is_session ? (
                                          <Badge variant="outline" className="text-xs w-fit">
                                            Sessione #{session.session_order || 1}
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs w-fit">
                                            Standard
                                          </Badge>
                                        )}
                                        {session.session_type && (
                                          <span className="text-xs text-muted-foreground">
                                            {session.session_type}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        {mealBenefits.mealVoucher && !session.is_session && (
                                          <Badge variant="secondary" className="text-xs">Buono</Badge>
                                        )}
                                        {mealBenefits.dailyAllowance && !session.is_session && (
                                          <Badge variant="outline" className="text-xs">Indennità</Badge>
                                        )}
                                        {(!mealBenefits.mealVoucher && !mealBenefits.dailyAllowance) || session.is_session ? (
                                          <span className="text-xs text-muted-foreground">-</span>
                                        ) : null}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <LocationDisplay 
                                        startLat={session.start_location_lat}
                                        startLng={session.start_location_lng}
                                        endLat={session.end_location_lat}
                                        endLng={session.end_location_lng}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => onEditTimesheet({ ...session, id: originalId })}
                                          title="Modifica timesheet principale"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        {!session.is_session && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onDeleteTimesheet(originalId)}
                                            className="text-red-600 hover:text-red-700"
                                            title="Elimina timesheet"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        )}
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