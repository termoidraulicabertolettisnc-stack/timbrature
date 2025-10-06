import { useState, useEffect, useMemo } from 'react';
import { useTimesheets } from '@/hooks/useTimesheets';
import { Coffee, Zap, Moon, UtensilsCrossed } from "lucide-react";
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
import { DayEditDialog } from '@/components/DayEditDialog';
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

// CORREZIONE COMPLETA: Funzione migliorata per estrarre UUID con gestione di tutti i formati
const extractRealTimesheetId = (compositeId: string): string => {
  console.log('🔧 EXTRACT UUID - Input:', compositeId);
  
  // Pattern per UUID valido
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  // Se è già un UUID valido, restituiscilo
  if (uuidPattern.test(compositeId)) {
    console.log('🔧 EXTRACT UUID - Already valid:', compositeId);
    return compositeId;
  }
  
  // Prova a estrarre il primo UUID valido dalla stringa
  const potentialUuids = compositeId.split(/[-_]/);
  
  // Ricostruisci possibili UUID combinando le parti
  for (let i = 0; i <= potentialUuids.length - 5; i++) {
    const candidate = potentialUuids.slice(i, i + 5).join('-');
    if (uuidPattern.test(candidate)) {
      console.log('🔧 EXTRACT UUID - Found valid UUID:', candidate, 'from position', i);
      return candidate;
    }
  }
  
  // Fallback: prova con separatori diversi
  if (compositeId.includes('_session_')) {
    const beforeSession = compositeId.split('_session_')[0];
    if (uuidPattern.test(beforeSession)) {
      console.log('🔧 EXTRACT UUID - Extracted before _session_:', beforeSession);
      return beforeSession;
    }
  }
  
  if (compositeId.includes('_')) {
    const firstPart = compositeId.split('_')[0];
    if (uuidPattern.test(firstPart)) {
      console.log('🔧 EXTRACT UUID - Extracted first part:', firstPart);
      return firstPart;
    }
  }
  
  console.error('🔧 EXTRACT UUID - No valid UUID found in:', compositeId);
  throw new Error(`Impossibile estrarre UUID valido da: ${compositeId}`);
};

// CORREZIONE: Validazione UUID helper
const isValidUUID = (uuid: string): boolean => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
};

// CORREZIONE: Debug helper per analizzare ID problematici
const debugTimesheetId = (id: string) => {
  console.log('🔍 DEBUG ID:', {
    original: id,
    isValidUUID: isValidUUID(id),
    containsSession: id.includes('_session_'),
    containsUnderscore: id.includes('_'),
    containsSessionDash: id.includes('-session-'),
    parts: id.split(/[_-]/),
    extractedId: extractRealTimesheetId(id)
  });
};

// CORREZIONE: Verifica integrità dati prima dell'eliminazione
const verifyTimesheetIntegrity = async (timesheetId: string) => {
  const realId = extractRealTimesheetId(timesheetId);
  
  // Verifica che il timesheet esista
  const { data: timesheet, error } = await supabase
    .from('timesheets')
    .select('id, user_id, start_time, end_time')
    .eq('id', realId)
    .single();
    
  if (error) {
    console.error('🔧 INTEGRITY CHECK - Timesheet not found:', error);
    return { valid: false, error: 'Timesheet non trovato' };
  }
  
  // Verifica le sessioni collegate
  const { data: sessions } = await supabase
    .from('timesheet_sessions')
    .select('id, session_order')
    .eq('timesheet_id', realId);
  
  console.log('🔧 INTEGRITY CHECK - Results:', {
    timesheetId: realId,
    exists: !!timesheet,
    sessionsCount: sessions?.length || 0
  });
  
  return {
    valid: true,
    timesheet,
    sessions: sessions || [],
    sessionCount: sessions?.length || 0
  };
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
  regular_hours: number;
  meal_vouchers: number;
  saturday_hours?: number;
  holiday_hours?: number;
  total_sessions?: number;
  timesheets: ExtendedTimesheetWithProfile[];
}

// CORREZIONE: Componente per visualizzare ore con calcolo corretto
export const HoursDisplayFixed = ({ 
  employee, 
  standardDailyHours = 8 
}: { 
  employee: EmployeeSummary;
  standardDailyHours?: number;
}) => {
  const formatHours = (hours: number) => {
    return hours.toFixed(1) + 'h';
  };

  return (
    <div className="space-y-1">
      <div className="text-sm">
        <span className="font-medium">Totale: </span>
        <Badge variant="secondary">{formatHours(employee.total_hours)}</Badge>
      </div>
      
      <div className="text-xs text-gray-600">
        <span>Ordinarie: </span>
        <span className="text-green-600">{formatHours(employee.regular_hours)}</span>
        
        {employee.overtime_hours > 0 && (
          <>
            <span className="mx-1">•</span>
            <span>Straordinari: </span>
            <span className="text-orange-600 font-medium">
              {formatHours(employee.overtime_hours)}
            </span>
          </>
        )}
        
        {employee.night_hours > 0 && (
          <>
            <span className="mx-1">•</span>
            <span>Notturne: </span>
            <span className="text-blue-600">{formatHours(employee.night_hours)}</span>
          </>
        )}
      </div>
      
      {employee.meal_vouchers > 0 && (
        <div className="text-xs">
          <Badge variant="outline" className="text-xs">
            {employee.meal_vouchers} buoni pasto
          </Badge>
        </div>
      )}
    </div>
  );
};

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
  
  
  const [absences, setAbsences] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  // Stati per i filtri
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Use React Query hook for timesheets (after state declarations)
  const { 
    timesheets, 
    isLoading: loading, 
    invalidate: invalidateTimesheets 
  } = useTimesheets({
    dateFilter,
    activeView,
    selectedEmployee,
    selectedProject,
  });

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
  const [dayEditDialogOpen, setDayEditDialogOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetWithProfile | null>(null);
  const [selectedTimesheetDate, setSelectedTimesheetDate] = useState<string>('');
  const [dayEditData, setDayEditData] = useState<{
    date: string;
    employee: any;
    timesheet: TimesheetWithProfile | null;
    sessions: any[];
  } | null>(null);

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

  // Funzione per gestire l'apertura del DayEditDialog
  const handleEditDay = (date: string, employee: any, timesheet: TimesheetWithProfile | null, sessions: any[]) => {
    setDayEditData({ date, employee, timesheet, sessions });
    setDayEditDialogOpen(true);
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
          console.log('🔄 Cache invalidation triggered by realtime');
          invalidateTimesheets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateTimesheets]);

  useEffect(() => {
    if (user) {
      loadEmployees();
      loadProjects();
      loadSettings();
    }
  }, [user]);

  // Separate useEffect for absences (triggered by same filters as timesheets hook)
  useEffect(() => {
    if (user) {
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
        default:
          startDate = baseDate;
          endDate = baseDate;
      }
      
      loadAbsences(startDate, endDate);
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

  // CORREZIONE COMPLETA: Funzione unificata per eliminazione con opzioni
  const handleDeleteTimesheetUnified = async (
    timesheetId: string, 
    deleteType: 'timesheet' | 'session' = 'timesheet',
    sessionId?: string
  ) => {
    console.log('🔧 UNIFIED DELETE - Starting:', {
      timesheetId,
      deleteType,
      sessionId
    });

    // Conferma appropriata in base al tipo
    const confirmMessage = deleteType === 'session' 
      ? 'Sei sicuro di voler eliminare questa sessione?' 
      : 'Sei sicuro di voler eliminare questo timesheet con tutte le sessioni?';
      
    if (!confirm(`${confirmMessage} Questa azione non può essere annullata.`)) {
      return false;
    }

    try {
      // Estrai UUID reale
      const realId = extractRealTimesheetId(timesheetId);
      console.log('🔧 UNIFIED DELETE - Real ID:', realId);

      // Verifica autenticazione
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Utente non autenticato');
      }

      // Verifica esistenza timesheet
      const { data: timesheet, error: checkError } = await supabase
        .from('timesheets')
        .select('id, user_id')
        .eq('id', realId)
        .single();
        
      if (checkError) {
        if (checkError.code === 'PGRST116') {
          throw new Error('Timesheet non trovato');
        }
        throw new Error(`Errore verifica timesheet: ${checkError.message}`);
      }

      if (deleteType === 'session' && sessionId) {
        // ELIMINA SOLO UNA SESSIONE SPECIFICA
        console.log('🔧 UNIFIED DELETE - Deleting specific session:', sessionId);
        
        const { error: sessionError } = await supabase
          .from('timesheet_sessions')
          .delete()
          .eq('id', sessionId)
          .eq('timesheet_id', realId);
          
        if (sessionError) {
          throw new Error(`Errore eliminazione sessione: ${sessionError.message}`);
        }
        
        console.log('🔧 UNIFIED DELETE - Session deleted successfully');
        
      } else {
        // ELIMINA TUTTO IL TIMESHEET CON TUTTE LE SESSIONI
        console.log('🔧 UNIFIED DELETE - Deleting entire timesheet');
        
        // Prima elimina tutte le sessioni
        const { error: sessionsError } = await supabase
          .from('timesheet_sessions')
          .delete()
          .eq('timesheet_id', realId);
          
        if (sessionsError) {
          console.error('🔧 UNIFIED DELETE - Sessions deletion error:', sessionsError);
          throw new Error(`Errore eliminazione sessioni: ${sessionsError.message}`);
        }
        
        // Poi elimina il timesheet principale
        const { error: timesheetError } = await supabase
          .from('timesheets')
          .delete()
          .eq('id', realId);
          
        if (timesheetError) {
          throw new Error(`Errore eliminazione timesheet: ${timesheetError.message}`);
        }
        
        console.log('🔧 UNIFIED DELETE - Entire timesheet deleted successfully');
      }

      // Messaggio di successo
      toast({
        title: "Successo",
        description: deleteType === 'session' 
          ? "Sessione eliminata con successo" 
          : "Timesheet eliminato con successo",
      });

      // Invalida cache per ricaricare
      invalidateTimesheets();
      return true;

    } catch (error: any) {
      console.error('🔧 UNIFIED DELETE - Error:', error);
      
      toast({
        title: "Errore",
        description: error.message || 'Errore durante l\'eliminazione',
        variant: "destructive",
      });
      
      return false;
    }
  };

  // CORREZIONE COMPLETA: Componenti specifici per ogni vista definiti all'interno del componente

  // VISTA SETTIMANALE: Pulsanti per eliminare singola sessione
  const WeeklyTimelineEntryActions = ({ 
    entry, 
    onDeleteTimesheet, 
    onEditTimesheet,
    originalId 
  }: any) => {
    const handleDeleteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Determina se eliminare sessione o timesheet intero
      const isMultiSession = entry.timesheet.id.includes('_session_');
      const sessionId = isMultiSession ? entry.timesheet.id.split('_')[2] : undefined;
      
      console.log('🔧 WEEKLY DELETE - Click:', {
        entryId: entry.timesheet.id,
        originalId,
        isMultiSession,
        sessionId
      });
      
      if (isMultiSession && sessionId) {
        // Elimina solo la sessione specifica
        handleDeleteTimesheetUnified(originalId, 'session', sessionId)
          .then(success => success && onDeleteTimesheet?.(originalId));
      } else {
        // Elimina tutto il timesheet
        handleDeleteTimesheetUnified(originalId, 'timesheet')
          .then(success => success && onDeleteTimesheet?.(originalId));
      }
    };

    return (
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-white hover:text-white hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onEditTimesheet?.(entry.timesheet);
          }}
        >
          <Edit className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0 text-white hover:text-red-200 hover:bg-red-500/20"
          onClick={handleDeleteClick}
          title={entry.timesheet.id.includes('_session_') ? "Elimina questa sessione" : "Elimina tutto il timesheet"}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  // VISTA MENSILE: Pulsante per eliminare intera giornata
  const MonthlyDayActions = ({ 
    dayData, 
    onDeleteTimesheet 
  }: {
    dayData: any;
    onDeleteTimesheet: (id: string) => void;
  }) => {
    const handleDeleteDay = () => {
      // Trova il timesheet principale (primo della giornata)
      const mainTimesheet = dayData.timesheets[0];
      if (!mainTimesheet) return;
      
      console.log('🔧 MONTHLY DELETE - Day:', {
        date: dayData.date,
        timesheetsCount: dayData.timesheets.length,
        mainTimesheetId: mainTimesheet.id
      });
      
      // Elimina tutto il timesheet della giornata
      handleDeleteTimesheetUnified(mainTimesheet.id, 'timesheet')
        .then(success => success && onDeleteTimesheet(mainTimesheet.id));
    };

    if (dayData.timesheets.length === 0) return null;

    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={handleDeleteDay}
        title={`Elimina tutte le ${dayData.timesheets.length} sessioni di questa giornata`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  };

  // VISTA GIORNALIERA: Pulsanti per ogni sessione individuale
  const DailySummarySessionActions = ({
    session,
    onDeleteTimesheetLocal,
    onEditTimesheet
  }: any) => {
    const handleDeleteSession = () => {
      const isSpecificSession = session.id.includes('_session_');
      const sessionId = isSpecificSession ? session.id.split('_')[2] : undefined;
      const originalId = isSpecificSession ? session.id.split('_')[0] : session.id;
      
      console.log('🔧 DAILY DELETE - Session:', {
        sessionId: session.id,
        isSpecificSession,
        extractedSessionId: sessionId,
        originalId
      });
      
      if (isSpecificSession && sessionId) {
        // Elimina solo questa sessione
        handleDeleteTimesheetUnified(originalId, 'session', sessionId)
          .then(success => success && onDeleteTimesheetLocal?.(originalId));
      } else {
        // Elimina tutto il timesheet
        handleDeleteTimesheetUnified(originalId, 'timesheet')
          .then(success => success && onDeleteTimesheetLocal?.(originalId));
      }
    };

    return (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onEditTimesheet(session)}
        >
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
          onClick={handleDeleteSession}
          title={session.id.includes('_session_') ? "Elimina questa sessione" : "Elimina tutto il timesheet"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

// loadTimesheets removed - now using useTimesheets hook with React Query

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

  // CORREZIONE: Aggregazione corretta delle sessioni multiple per dipendente
const aggregateTimesheetsByEmployee = (): EmployeeSummary[] => {
  const employeeMap = new Map<string, EmployeeSummary>();
  
  filteredTimesheets.forEach((timesheet) => {
    const userId = timesheet.user_id;
    
    if (!employeeMap.has(userId)) {
      employeeMap.set(userId, {
        user_id: userId,
        first_name: timesheet.profiles?.first_name || '',
        last_name: timesheet.profiles?.last_name || '',
        email: timesheet.profiles?.email || '',
        total_hours: 0,
        overtime_hours: 0,
        night_hours: 0,
        regular_hours: 0,
        meal_vouchers: 0,
        timesheets: [],
        total_sessions: 0
      });
    }
    
    const employee = employeeMap.get(userId)!;
    
    // Aggiungi il timesheet alla lista
    employee.timesheets.push(timesheet);
    
    // Conta il numero di sessioni
    const sessions = timesheet.timesheet_sessions || [];
    if (sessions.length > 0) {
      employee.total_sessions += sessions.length;
      
      // Calcola le ore totali sommando le ore di ogni sessione
      sessions.forEach(session => {
        if (session.start_time && session.end_time) {
          const start = new Date(`2000-01-01T${session.start_time}`);
          const end = new Date(`2000-01-01T${session.end_time}`);
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          employee.total_hours += hours;
        }
      });
    } else {
      employee.total_sessions += 1;
      employee.total_hours += parseFloat(String(timesheet.total_hours || 0));
    }
    
    // Aggrega straordinari e notturne solo una volta per timesheet
    employee.overtime_hours += parseFloat(String(timesheet.overtime_hours || 0));
    employee.night_hours += parseFloat(String(timesheet.night_hours || 0));
  });
  
  // Calcola ore regolari per ogni dipendente
  employeeMap.forEach((employee) => {
    employee.regular_hours = Math.max(0, employee.total_hours - employee.overtime_hours);
    // Calcola buoni pasto basandosi su meal_voucher_earned
    employee.timesheets.forEach(t => {
      if (t.meal_voucher_earned) {
        employee.meal_vouchers++;
      }
    });
  });
  
  return Array.from(employeeMap.values());
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
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen} modal={false}>
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
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFilter ? parseISO(dateFilter) : undefined}
                    defaultMonth={dateFilter ? parseISO(dateFilter) : undefined}
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
    dateFilter={dateFilter}
    aggregateTimesheetsByEmployee={aggregateTimesheetsByEmployee}
    employeeSettings={employeeSettings}
    companySettings={companySettings}
    onEditDay={handleEditDay}
    onDeleteTimesheet={handleDeleteTimesheetUnified}
    onNavigatePrevious={navigatePrevious}
    onNavigateNext={navigateNext}
    onNavigateToday={navigateToToday}
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
            onDeleteTimesheet={handleDeleteTimesheetUnified}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
            onEditDay={handleEditDay}
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
            onDeleteTimesheet={handleDeleteTimesheetUnified}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
            onEditDay={handleEditDay}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog per modifica */}
      <TimesheetEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        timesheet={editingTimesheet}
        onSuccess={() => {
          invalidateTimesheets();
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
          invalidateTimesheets();
          setInsertDialogOpen(false);
        }}
      />

      {/* Dialog per inserimento assenza */}
      <AbsenceInsertDialog
        open={absenceDialogOpen}
        onOpenChange={setAbsenceDialogOpen}
        onSuccess={() => {
          invalidateTimesheets(); // Invalida cache timesheets e ricarica assenze
          setAbsenceDialogOpen(false);
        }}
      />

      {/* Dialog per importazione Excel */}
      <TimesheetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={() => {
          invalidateTimesheets();
        }}
      />

      {/* Dialog per modifica giornata completa */}
      {dayEditData && (
        <DayEditDialog
          open={dayEditDialogOpen}
          onOpenChange={setDayEditDialogOpen}
          date={dayEditData.date}
          employee={dayEditData.employee}
          timesheet={dayEditData.timesheet}
          sessions={dayEditData.sessions}
          employeeSettings={employeeSettings}
          companySettings={companySettings}
          onSuccess={() => {
            invalidateTimesheets();
            setDayEditDialogOpen(false);
            setDayEditData(null);
          }}
        />
      )}
    </div>
  );
}

// CORREZIONE COMPLETA: Componenti specifici per ogni vista

// CORREZIONE: Vista giornaliera aggiornata per gestire le sessioni multiple
function DailySummaryViewFixed({ 
  timesheets, 
  absences,
  dateFilter,
  aggregateTimesheetsByEmployee,
  employeeSettings,
  companySettings,
  onEditDay,
  onDeleteTimesheet,
  onNavigatePrevious,
  onNavigateNext,
  onNavigateToday
}: {
  timesheets: TimesheetWithProfile[];
  absences: any[];
  dateFilter: string;
  aggregateTimesheetsByEmployee: () => EmployeeSummary[];
  employeeSettings: any;
  companySettings: any;
  onEditDay?: (date: string, employee: any, timesheet: TimesheetWithProfile, sessions: any[]) => void;
  onDeleteTimesheet: (id: string) => void;
  onNavigatePrevious: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
}) {
    // ========== AGGIUNGI QUESTO BLOCCO DI DEBUG ==========
  console.log('🎯 VISTA GIORNALIERA - DEBUG COMPLETO:', {
    numero_timesheets_ricevuti: timesheets.length,
    timesheets: timesheets,
    primo_timesheet: timesheets[0],
    ha_sessioni_il_primo: timesheets[0]?.timesheet_sessions,
  });
  
  // Debug specifico per Lorenzo
  const lorenzoData = timesheets.filter(t => 
    t.profiles?.first_name === 'Lorenzo'
  );
  
  console.log('🔎 VISTA GIORNALIERA - LORENZO:', {
    trovati: lorenzoData.length,
    dettaglio: lorenzoData.map(t => ({
      data: t.date,
      sessioni: t.timesheet_sessions,
      numero_sessioni: t.timesheet_sessions?.length || 0
    }))
  });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Riepilogo Giornaliero - Tutte le Sessioni
            </CardTitle>
            <CardDescription>
              Visualizzazione aggregata per dipendente con tutte le sessioni multiple
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={onNavigatePrevious}
              title="Giorno precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={onNavigateToday}
              className="min-w-[80px]"
            >
              Oggi
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onNavigateNext}
              title="Giorno successivo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {format(parseISO(dateFilter), 'dd MMMM yyyy', { locale: it })}
        </div>
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
                          {employee.total_sessions || employee.timesheets.length} sessioni
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
  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
    <ChevronDown className="h-4 w-4" />
    Dettagli sessioni ({employee.total_sessions || employee.timesheets.length} voci)
  </CollapsibleTrigger>
  <CollapsibleContent>
    <div className="mt-4 overflow-x-auto">
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
          {employee.timesheets.map((timesheet: TimesheetWithProfile) => {
            // Gestione sessioni multiple
            const sessions = timesheet.timesheet_sessions || [];
            
            if (sessions.length > 0) {
              // Se ci sono sessioni, mostra una riga per ogni sessione
              return sessions.map((session, sessionIndex) => (
                <TableRow key={`${timesheet.id}_session_${session.id}`}>
                  <TableCell>
                    {sessionIndex === 0 ? format(parseISO(timesheet.date), 'dd/MM/yyyy') : ''}
                  </TableCell>
                  <TableCell>
                    {sessionIndex === 0 ? (timesheet.projects?.name || 'N/A') : ''}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        S{sessionIndex + 1}
                      </Badge>
                      <span className="font-mono text-sm">
                        {session.start_time ? session.start_time.substring(0, 5) : '--:--'} - 
                        {session.end_time ? session.end_time.substring(0, 5) : '--:--'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // Calcola ore per questa sessione
                      if (session.start_time && session.end_time) {
                        const start = new Date(`2000-01-01T${session.start_time}`);
                        const end = new Date(`2000-01-01T${session.end_time}`);
                        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                        return hours.toFixed(2) + 'h';
                      }
                      return '0.00h';
                    })()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {session.session_type || 'work'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {sessionIndex === 0 && timesheet.meal_voucher_earned && (
                      <Badge className="bg-green-100 text-green-800">Sì</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {sessionIndex === 0 && (timesheet.start_location_lat && timesheet.start_location_lng) ? (
                      <span className="text-xs">
                        {timesheet.start_location_lat.toFixed(4)}, {timesheet.start_location_lng.toFixed(4)}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (onEditDay) {
                            const employeeData = {
                              user_id: employee.user_id,
                              first_name: employee.first_name,
                              last_name: employee.last_name,
                              email: employee.email
                            };
                            onEditDay(timesheet.date, employeeData, timesheet, timesheet.timesheet_sessions || []);
                          }
                        }}
                        title="Modifica giornata"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {sessionIndex === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteTimesheet(timesheet.id)}
                          title="Elimina timesheet"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ));
            } else {
              // Fallback per timesheet senza sessioni
              return (
                <TableRow key={timesheet.id}>
                  <TableCell>{format(parseISO(timesheet.date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{timesheet.projects?.name || 'N/A'}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">
                      {timesheet.start_time ? format(parseISO(timesheet.start_time), 'HH:mm') : '--:--'} -
                      {timesheet.end_time ? format(parseISO(timesheet.end_time), 'HH:mm') : '--:--'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {timesheet.total_hours?.toFixed(2) || '0.00'}h
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {timesheet.is_absence ? timesheet.absence_type : 'work'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {timesheet.meal_voucher_earned && (
                      <Badge className="bg-green-100 text-green-800">Sì</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(timesheet.start_location_lat && timesheet.start_location_lng) ? (
                      <span className="text-xs">
                        {timesheet.start_location_lat.toFixed(4)}, {timesheet.start_location_lng.toFixed(4)}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (onEditDay) {
                            const employeeData = {
                              user_id: employee.user_id,
                              first_name: employee.first_name,
                              last_name: employee.last_name,
                              email: employee.email
                            };
                            onEditDay(timesheet.date, employeeData, timesheet, []);
                          }
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTimesheet(timesheet.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
          }).flat()} {/* Importante: .flat() per appiattire l'array di arrays */}
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