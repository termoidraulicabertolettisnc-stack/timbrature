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
    } else {
      setTimesheetData({
        project_id: '',
        notes: '',
        is_saturday: false,
        is_holiday: false,
      });
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
  };

   const loadLunchBreakConfig = async () => {
    if (!timesheet?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('timesheets')
        .select('lunch_duration_minutes')
        .eq('id', timesheet.id)
        .single();

      if (data) {
        const lunchMinutes = data.lunch_duration_minutes || 60;
        setLunchBreakData({
          configured_minutes: lunchMinutes,
          override_minutes: null,
          effective_minutes: lunchMinutes,
        });
        setShowLunchOverride(false);
      }
    } catch (error) {
      console.error('Error loading lunch config:', error);
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

  const validateSessions = (): { hasOverlap: boolean; message: string } => {
    if (sessions.length === 0) {
      return { hasOverlap: false, message: '' };
    }

    // Filtra solo le sessioni con start_time e end_time validi
    const validSessions = sessions.filter(s => s.start_time && s.end_time);
    
    if (validSessions.length === 0) {
      return { hasOverlap: false, message: '' };
    }

    // Ordina le sessioni per start_time
    const sortedSessions = [...validSessions].sort((a, b) => {
      const timeA = new Date(`${date}T${a.start_time}:00`).getTime();
      const timeB = new Date(`${date}T${b.start_time}:00`).getTime();
      return timeA - timeB;
    });

    // Controlla sovrapposizioni e pause minime
    for (let i = 0; i < sortedSessions.length - 1; i++) {
      const current = sortedSessions[i];
      const next = sortedSessions[i + 1];

      const currentEnd = new Date(`${date}T${current.end_time}:00`);
      const nextStart = new Date(`${date}T${next.start_time}:00`);

      // Controlla sovrapposizione
      if (currentEnd > nextStart) {
        return {
          hasOverlap: true,
          message: `Sovrapposizione rilevata: la sessione ${current.session_order} termina dopo l'inizio della sessione ${next.session_order}.`
        };
      }

      // Controlla pausa minima (10 minuti = 600000 ms)
      const breakMinutes = (nextStart.getTime() - currentEnd.getTime()) / (1000 * 60);
      if (breakMinutes < 10) {
        return {
          hasOverlap: false,
          message: `Attenzione: la pausa tra sessione ${current.session_order} e ${next.session_order} è di soli ${Math.round(breakMinutes)} minuti (minimo consigliato: 10 minuti).`
        };
      }
    }

    return { hasOverlap: false, message: '' };
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
            start_time: session.start_time ? localTimeToUtc(date, session.start_time) : null,
            end_time: session.end_time ? localTimeToUtc(date, session.end_time) : null,
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
  const validation = validateSessions();

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
              {/* Validation Alert */}
              {validation.message && (
                <Alert variant={validation.hasOverlap ? "destructive" : "default"}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{validation.message}</AlertDescription>
                </Alert>
              )}

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
            <Button 
              onClick={handleSave} 
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva Modifiche
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}