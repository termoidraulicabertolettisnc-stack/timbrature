import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Plus, 
  Trash2, 
  Clock, 
  UtensilsCrossed,
  CalendarDays,
  User,
  AlertTriangle
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TimesheetWithProfile } from '@/types/timesheet';
import { BenefitsService } from '@/services/BenefitsService';

interface Project {
  id: string;
  name: string;
}

interface LunchBreakData {
  configured_minutes: number;
  override_minutes: number | null;
  effective_minutes: number;
}
interface SessionData {
  id?: string;
  session_order: number;
  start_time: string;
  end_time: string;
  session_type: string;
  notes: string;
  isNew?: boolean;
}

interface DayEditDialogProps {
  date: string;
  employee: {
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  timesheet: TimesheetWithProfile | null;
  sessions: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  employeeSettings?: any;
  companySettings?: any;
}

const TZ = 'Europe/Rome';

const utcToLocalTime = (timeString: string): string => {
  try {
    // Se è nel formato TIME (HH:mm, HH:mm:ss, o HH:mm:ss.SSS)
    if (/^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(timeString)) {
      return timeString.substring(0, 5); // Restituisce sempre HH:mm
    }
    
    // Altrimenti, converti da timestamp UTC
    const localTime = toZonedTime(new Date(timeString), TZ);
    return format(localTime, 'HH:mm');
  } catch (error) {
    console.error('Error converting time:', error);
    return '';
  }
};

const localTimeToUtc = (dateString: string, timeString: string): string => {
  try {
    const localDateTime = `${dateString}T${timeString}:00`;
    const utcTime = fromZonedTime(new Date(localDateTime), TZ);
    return utcTime.toISOString();
  } catch (error) {
    console.error('Error converting local time to UTC:', error);
    return new Date().toISOString();
  }
};

const formatTimeForDatabase = (timeString: string): string => {
  if (!timeString) return '';
  if (timeString.includes(':') && timeString.split(':').length === 3) {
    return timeString;
  }
  return `${timeString}:00`;
};

export function DayEditDialog({
  date,
  employee,
  timesheet,
  sessions: initialSessions,
  open,
  onOpenChange,
  onSuccess,
  employeeSettings,
  companySettings
}: DayEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  
  // Form state
  const [timesheetData, setTimesheetData] = useState({
    project_id: '',
    notes: '',
    is_saturday: false,
    is_holiday: false,
  });

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [nextSessionOrder, setNextSessionOrder] = useState(1);
  // Stati per gestione pausa pranzo
  const [lunchBreakData, setLunchBreakData] = useState<LunchBreakData>({
  configured_minutes: 60,
  override_minutes: null,
  effective_minutes: 60,
  });
  const [showLunchOverride, setShowLunchOverride] = useState(false);
  
  // Load projects when dialog opens
  useEffect(() => {
    if (open) {
      loadProjects();
      initializeData();
    }
  }, [open, timesheet, initialSessions]);

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const initializeData = () => {
    // Initialize timesheet data
    if (timesheet) {
      setTimesheetData({
        project_id: timesheet.project_id || '',
        notes: timesheet.notes || '',
        is_saturday: timesheet.is_saturday,
        is_holiday: timesheet.is_holiday,
      });

      // Carica l'override della pausa pranzo se esiste
      if (timesheet.lunch_duration_minutes !== null && timesheet.lunch_duration_minutes !== undefined) {
        setShowLunchOverride(true);
        setLunchBreakData(prev => ({
          ...prev,
          override_minutes: timesheet.lunch_duration_minutes,
          effective_minutes: timesheet.lunch_duration_minutes
        }));
      } else {
        setShowLunchOverride(false);
        // Usa la configurazione di default (già caricata in effectiveSettings)
      }
    } else {
      setTimesheetData({
        project_id: '',
        notes: '',
        is_saturday: false,
        is_holiday: false,
      });
      setShowLunchOverride(false);
    }

    // Initialize sessions data
    const sessionData: SessionData[] = [];
    
    if (timesheet && timesheet.timesheet_sessions) {
      // Load existing sessions
      timesheet.timesheet_sessions.forEach((session, index) => {
        sessionData.push({
          id: session.id,
          session_order: session.session_order,
          start_time: session.start_time ? utcToLocalTime(session.start_time) : '',
          end_time: session.end_time ? utcToLocalTime(session.end_time) : '',
          session_type: session.session_type || 'work',
          notes: session.notes || '',
        });
      });
      setNextSessionOrder((timesheet.timesheet_sessions?.length || 0) + 1);
    } else if (timesheet && timesheet.start_time) {
      // Convert legacy timesheet to session format
      sessionData.push({
        session_order: 1,
        start_time: utcToLocalTime(timesheet.start_time),
        end_time: timesheet.end_time ? utcToLocalTime(timesheet.end_time) : '',
        session_type: 'work',
        notes: '',
      });
      setNextSessionOrder(2);
    } else {
      setNextSessionOrder(1);
    }

    setSessions(sessionData);
    loadLunchBreakConfig();
  };

  const loadLunchBreakConfig = async () => {
    if (!timesheet?.id) return;
    
    try {
      const { data: timesheetData, error: timesheetError } = await supabase
        .from('timesheets')
        .select('lunch_duration_minutes')
        .eq('id', timesheet.id)
        .single();

      if (timesheetError) throw timesheetError;

      const { data: employeeData } = await supabase
        .from('employee_settings')
        .select('lunch_break_type, lunch_break_minutes')
        .eq('user_id', employee.user_id)
        .lte('valid_from', date)
        .or(`valid_to.is.null,valid_to.gte.${date}`)
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', employee.user_id)
        .single();

      let companyData = null;
      if (profileData) {
        const { data: companySettings } = await supabase
          .from('company_settings')
          .select('lunch_break_type, lunch_break_minutes')
          .eq('company_id', profileData.company_id)
          .single();
        companyData = companySettings;
      }

      let configuredMinutes = 60;
      let configSource = 'default';

      if (employeeData?.lunch_break_type) {
        if (employeeData.lunch_break_type === 'libera') {
          configuredMinutes = 0;
        } else {
          const match = employeeData.lunch_break_type.match(/(\d+)_minuti/);
          configuredMinutes = match ? parseInt(match[1]) : employeeData.lunch_break_minutes || 60;
        }
        configSource = 'dipendente';
      } else if (companyData?.lunch_break_type) {
        if (companyData.lunch_break_type === 'libera') {
          configuredMinutes = 0;
        } else {
          const match = companyData.lunch_break_type.match(/(\d+)_minuti/);
          configuredMinutes = match ? parseInt(match[1]) : companyData.lunch_break_minutes || 60;
        }
        configSource = 'azienda';
      }

      const hasOverride = timesheetData?.lunch_duration_minutes !== null && 
                         timesheetData?.lunch_duration_minutes !== undefined;
      
      setLunchBreakData({
        configured_minutes: configuredMinutes,
        override_minutes: hasOverride ? timesheetData.lunch_duration_minutes : null,
        effective_minutes: hasOverride ? timesheetData.lunch_duration_minutes : configuredMinutes,
      });
      
      setShowLunchOverride(hasOverride);

      console.log('🔧 LUNCH CONFIG LOADED:', {
        configured: configuredMinutes,
        source: configSource,
        override: hasOverride ? timesheetData.lunch_duration_minutes : 'none',
        effective: hasOverride ? timesheetData.lunch_duration_minutes : configuredMinutes
      });

    } catch (error) {
      console.error('Error loading lunch config:', error);
      setLunchBreakData({
        configured_minutes: 60,
        override_minutes: null,
        effective_minutes: 60,
      });
    }
  };

  const addNewSession = () => {
    const newSession: SessionData = {
      session_order: nextSessionOrder,
      start_time: '',
      end_time: '',
      session_type: 'work',
      notes: '',
      isNew: true,
    };
    
    setSessions(prev => [...prev, newSession]);
    setNextSessionOrder(prev => prev + 1);
  };

  const removeSession = (index: number) => {
    setSessions(prev => prev.filter((_, i) => i !== index));
  };

  const updateSession = (index: number, field: keyof SessionData, value: string) => {
    setSessions(prev => prev.map((session, i) => 
      i === index ? { ...session, [field]: value } : session
    ));
  };

  interface ValidationResult {
    hasErrors: boolean;
    hasWarnings: boolean;
    messages: {
      type: 'error' | 'warning' | 'info';
      message: string;
    }[];
  }

  const validateSessions = (): ValidationResult => {
    const result: ValidationResult = {
      hasErrors: false,
      hasWarnings: false,
      messages: []
    };

    if (sessions.length === 0) return result;

    const sortedSessions = [...sessions]
      .filter(s => s.start_time && s.end_time)
      .sort((a, b) => {
        const timeA = a.start_time.split(':').map(Number);
        const timeB = b.start_time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });

    sortedSessions.forEach((session, index) => {
      const startMinutes = session.start_time.split(':').map(Number);
      const endMinutes = session.end_time.split(':').map(Number);
      const startTotal = startMinutes[0] * 60 + startMinutes[1];
      const endTotal = endMinutes[0] * 60 + endMinutes[1];

      if (endTotal <= startTotal) {
        result.hasErrors = true;
        result.messages.push({
          type: 'error',
          message: `Sessione #${session.session_order}: l'orario di fine (${session.end_time}) è precedente o uguale all'inizio (${session.start_time})`
        });
      }

      if (index < sortedSessions.length - 1) {
        const nextSession = sortedSessions[index + 1];
        const nextStartMinutes = nextSession.start_time.split(':').map(Number);
        const nextStartTotal = nextStartMinutes[0] * 60 + nextStartMinutes[1];

        if (endTotal > nextStartTotal) {
          result.hasErrors = true;
          result.messages.push({
            type: 'error',
            message: `Sovrapposizione: Sessione #${session.session_order} termina alle ${session.end_time}, ma Sessione #${nextSession.session_order} inizia alle ${nextSession.start_time}`
          });
        } else if (nextStartTotal - endTotal < 10) {
          result.hasWarnings = true;
          const pauseMinutes = nextStartTotal - endTotal;
          result.messages.push({
            type: 'info',
            message: `Nota: pausa di ${pauseMinutes} minuti tra Sessione #${session.session_order} (${session.end_time}) e #${nextSession.session_order} (${nextSession.start_time}). Verifica se corretto.`
          });
        }
      }
    });

    return result;
  };


  const calculateTotals = () => {
    let grossHours = 0; // Ore lorde (somma sessioni)
    let totalHours = 0; // Ore nette (lorde - pausa)
    let regularHours = 0;
    let overtimeHours = 0;
    let hasMealVoucher = false;

    // Calcola ore lorde (somma di tutte le sessioni)
    sessions.forEach(session => {
      if (session.start_time && session.end_time) {
        const startDate = new Date(`${date}T${session.start_time}:00`);
        const endDate = new Date(`${date}T${session.end_time}:00`);
        const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        
        if (duration > 0) {
          grossHours += duration;
        }
      }
    });

    // Calcola ore nette (lorde - pausa pranzo)
    const lunchHours = lunchBreakData.effective_minutes / 60;
    totalHours = Math.max(0, grossHours - lunchHours);

    // Calcola straordinari (oltre le 8h nette)
    const dailyLimit = 8;
    if (totalHours > dailyLimit) {
      regularHours = dailyLimit;
      overtimeHours = totalHours - dailyLimit;
    } else {
      regularHours = totalHours;
      overtimeHours = 0;
    }

    // Check meal voucher eligibility
    if (companySettings && totalHours >= (companySettings.meal_voucher_min_hours || 6)) {
      hasMealVoucher = true;
    }

    return {
      grossHours: Math.round(grossHours * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      hasMealVoucher,
    };
  };


  const handleSave = async () => {
    setLoading(true);
    
    try {
      const currentUserResult = await supabase.auth.getUser();
      if (currentUserResult.error) {
        throw new Error(`Errore autenticazione: ${currentUserResult.error.message}`);
      }

      const totals = calculateTotals();

      // Create or update main timesheet
      const timesheetPayload = {
        user_id: employee.user_id,
        date: date,
        project_id: timesheetData.project_id === 'none' ? null : timesheetData.project_id || null,
        notes: timesheetData.notes || null,
        is_saturday: timesheetData.is_saturday,
        is_holiday: timesheetData.is_holiday,
        total_hours: totals.totalHours,
        overtime_hours: totals.overtimeHours,
        meal_voucher_earned: totals.hasMealVoucher,
        lunch_duration_minutes: showLunchOverride ? lunchBreakData.override_minutes : null,
        updated_by: currentUserResult.data.user?.id || employee.user_id,
      };

      let timesheetId = timesheet?.id;
      
      if (timesheet) {
        // Update existing timesheet
        const { error } = await supabase
          .from('timesheets')
          .update(timesheetPayload)
          .eq('id', timesheet.id);
        
        if (error) throw error;
      } else {
        // Create new timesheet
        const { data, error } = await supabase
          .from('timesheets')
          .insert({
            ...timesheetPayload,
            created_by: currentUserResult.data.user?.id || employee.user_id,
          })
          .select()
          .single();
        
        if (error) throw error;
        timesheetId = data.id;
      }

      // Handle sessions
      if (timesheetId) {
        // Delete existing sessions if any
        if (timesheet?.timesheet_sessions?.length) {
          const { error: deleteError } = await supabase
            .from('timesheet_sessions')
            .delete()
            .eq('timesheet_id', timesheetId);
          
          if (deleteError) throw deleteError;
        }

        // Insert new sessions
        if (sessions.length > 0) {
          const sessionsToInsert = sessions.map(session => ({
            timesheet_id: timesheetId,
            session_order: session.session_order,
            start_time: session.start_time ? formatTimeForDatabase(session.start_time) : null,
            end_time: session.end_time ? formatTimeForDatabase(session.end_time) : null,
            session_type: session.session_type,
            notes: session.notes || null,
          }));

          const { error: insertError } = await supabase
            .from('timesheet_sessions')
            .insert(sessionsToInsert);
          
          if (insertError) throw insertError;
        }
      }

      toast({
        title: "Successo",
        description: `Giornata del ${format(parseISO(date), 'dd MMMM yyyy', { locale: it })} salvata con successo`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving day data:', error);
      toast({
        title: "Errore",
        description: `Errore nel salvataggio: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const totals = calculateTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Modifica Giornata - {format(parseISO(date), 'dd MMMM yyyy', { locale: it })}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            {employee.first_name} {employee.last_name} ({employee.email})
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Timesheet General Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informazioni Generali</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project">Progetto</Label>
                  <Select
                    value={timesheetData.project_id}
                    onValueChange={(value) => setTimesheetData(prev => ({ ...prev, project_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona progetto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun progetto</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_saturday"
                      checked={timesheetData.is_saturday}
                      onChange={(e) => setTimesheetData(prev => ({ ...prev, is_saturday: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="is_saturday">Sabato</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_holiday"
                      checked={timesheetData.is_holiday}
                      onChange={(e) => setTimesheetData(prev => ({ ...prev, is_holiday: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="is_holiday">Festivo</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Note</Label>
                <Textarea
                  id="notes"
                  placeholder="Note aggiuntive..."
                  value={timesheetData.notes}
                  onChange={(e) => setTimesheetData(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Lunch Break Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5" />
                Gestione Pausa Pranzo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Configurazione attiva */}
              <Alert>
                <UtensilsCrossed className="h-4 w-4" />
                <AlertDescription>
                  Configurazione attiva: <strong>{lunchBreakData.configured_minutes} minuti</strong>
                  {employeeSettings ? ' (da impostazioni dipendente)' : ' (da impostazioni aziendali)'}
                </AlertDescription>
              </Alert>

              {/* Override attivo */}
              {timesheet?.lunch_duration_minutes !== null && timesheet?.lunch_duration_minutes !== undefined && (
                <Alert className="border-purple-500 bg-purple-50 dark:bg-purple-950">
                  <AlertTriangle className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="text-purple-700 dark:text-purple-300">
                    Override attivo: <strong>{timesheet.lunch_duration_minutes} minuti</strong> per questa giornata
                  </AlertDescription>
                </Alert>
              )}

              {/* Switch per abilitare override */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <Label htmlFor="lunch-override" className="cursor-pointer">
                  Sovrascrivi pausa solo per questa giornata
                </Label>
                <Switch
                  id="lunch-override"
                  checked={showLunchOverride}
                  onCheckedChange={setShowLunchOverride}
                />
              </div>

              {/* Select per override minuti */}
              {showLunchOverride && (
                <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                  <Label htmlFor="override-minutes">Minuti pausa per questa giornata</Label>
                  <Select
                    value={lunchBreakData.override_minutes?.toString() || ''}
                    onValueChange={(value) => {
                      const minutes = parseInt(value);
                      setLunchBreakData(prev => ({
                        ...prev,
                        override_minutes: minutes,
                        effective_minutes: minutes,
                      }));
                    }}
                  >
                    <SelectTrigger id="override-minutes">
                      <SelectValue placeholder="Seleziona minuti" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 minuti</SelectItem>
                      <SelectItem value="15">15 minuti</SelectItem>
                      <SelectItem value="30">30 minuti</SelectItem>
                      <SelectItem value="45">45 minuti</SelectItem>
                      <SelectItem value="60">60 minuti</SelectItem>
                      <SelectItem value="90">90 minuti</SelectItem>
                      <SelectItem value="120">120 minuti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sessioni di Lavoro</CardTitle>
              <Button onClick={addNewSession} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Aggiungi Sessione
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nessuna sessione di lavoro</p>
                  <p className="text-sm">Clicca su "Aggiungi Sessione" per iniziare</p>
                </div>
              ) : (
                sessions.map((session, index) => (
                  <Card key={index} className="border-l-4 border-l-primary">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          Sessione #{session.session_order}
                        </CardTitle>
                        {sessions.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSession(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Ora Inizio</Label>
                          <Input
                            type="time"
                            value={session.start_time}
                            onChange={(e) => updateSession(index, 'start_time', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Ora Fine</Label>
                          <Input
                            type="time"
                            value={session.end_time}
                            onChange={(e) => updateSession(index, 'end_time', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select
                            value={session.session_type}
                            onValueChange={(value) => updateSession(index, 'session_type', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="work">Lavoro</SelectItem>
                              <SelectItem value="break">Pausa</SelectItem>
                              <SelectItem value="meeting">Riunione</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Note Sessione</Label>
                        <Input
                          placeholder="Note specifiche per questa sessione..."
                          value={session.notes}
                          onChange={(e) => updateSession(index, 'notes', e.target.value)}
                        />
                      </div>
                      {session.start_time && session.end_time && (
                        <div className="text-sm text-muted-foreground">
                          Durata: {(() => {
                            const start = new Date(`${date}T${session.start_time}:00`);
                            const end = new Date(`${date}T${session.end_time}:00`);
                            const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                            return duration > 0 ? `${duration.toFixed(2)}h` : 'Orario non valido';
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>

          {/* Validation Messages */}
          {(() => {
            const validation = validateSessions();
            if (validation.messages.length === 0) return null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Validazione Sessioni
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {validation.messages.map((msg, index) => (
                    <Alert 
                      key={index}
                      variant={msg.type === 'error' ? 'destructive' : 'default'}
                      className={msg.type === 'info' ? 'border-blue-200 bg-blue-50' : ''}
                    >
                      <AlertDescription className="text-sm">
                        {msg.type === 'error' && '🚫 '}
                        {msg.type === 'info' && 'ℹ️ '}
                        {msg.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Riepilogo Giornaliero</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Ore Lavorate (Lorde) */}
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totals.grossHours}h</div>
                  <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Ore Lavorate (Lorde)</div>
                  <div className="text-xs text-blue-500 dark:text-blue-400 mt-1">Somma sessioni</div>
                </div>

                {/* Pausa Pranzo */}
                <div className="text-center p-3 rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    -{(lunchBreakData.effective_minutes / 60).toFixed(2)}h
                  </div>
                  <div className="text-sm font-medium text-orange-700 dark:text-orange-300">Pausa Pranzo</div>
                  <div className="text-xs text-orange-500 dark:text-orange-400 mt-1">
                    {showLunchOverride ? 'Override manuale' : 'Da configurazione'}
                  </div>
                </div>

                {/* Ore Totali (Nette) */}
                <div className="text-center p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="text-2xl font-bold text-primary">{totals.totalHours}h</div>
                  <div className="text-sm font-medium">Ore Totali (Nette)</div>
                  <div className="text-xs text-muted-foreground mt-1">Lorde - Pausa</div>
                </div>

                {/* Straordinari */}
                <div className={`text-center p-3 rounded-lg border ${
                  totals.overtimeHours > 0 
                    ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800' 
                    : 'bg-muted border-muted'
                }`}>
                  <div className={`text-2xl font-bold ${
                    totals.overtimeHours > 0 
                      ? 'text-orange-600 dark:text-orange-400' 
                      : 'text-muted-foreground'
                  }`}>
                    {totals.overtimeHours}h
                  </div>
                  <div className={`text-sm font-medium ${
                    totals.overtimeHours > 0 
                      ? 'text-orange-700 dark:text-orange-300' 
                      : 'text-muted-foreground'
                  }`}>
                    Straordinari
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {totals.overtimeHours > 0 ? 'Oltre le 8h' : 'Nessuno'}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Formula Visiva */}
              <div className="text-center">
                <code className="text-sm font-mono bg-muted px-3 py-2 rounded">
                  {totals.grossHours.toFixed(2)}h (lordo) - {(lunchBreakData.effective_minutes / 60).toFixed(2)}h (pausa) = {totals.totalHours.toFixed(2)}h (netto)
                </code>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annulla
            </Button>
            <div className="flex flex-col items-end gap-2">
              <Button 
                onClick={handleSave} 
                disabled={loading || validateSessions().hasErrors}
                className="w-full md:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  'Salva Modifiche'
                )}
              </Button>
              {validateSessions().hasErrors && (
                <p className="text-sm text-destructive text-center">
                  Correggi gli errori nelle sessioni prima di salvare
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}