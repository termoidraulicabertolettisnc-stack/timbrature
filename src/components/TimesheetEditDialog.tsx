import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import LocationDisplay from './LocationDisplay';
import LocationTrackingRoute from './LocationTrackingRoute';
import { TimesheetWithProfile } from '@/types/timesheet';

interface Project {
  id: string;
  name: string;
}

interface TimesheetEditDialogProps {
  timesheet: TimesheetWithProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Costante per il timezone italiano
const TZ = 'Europe/Rome';

// Funzione per convertire da UTC a timezone locale per la visualizzazione
const utcToLocalTime = (utcString: string): string => {
  try {
    const localTime = toZonedTime(new Date(utcString), TZ);
    return format(localTime, 'HH:mm');
  } catch (error) {
    console.error('Error converting UTC to local time:', error);
    return '';
  }
};

// Funzione per convertire da timezone locale a UTC per il salvataggio
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

export function TimesheetEditDialog({ timesheet, open, onOpenChange, onSuccess }: TimesheetEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [defaultLunchMinutes, setDefaultLunchMinutes] = useState<number>(60); // Default 60 minutes
  
  // Form state
  const [formData, setFormData] = useState({
    date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    lunch_start_time: '',
    lunch_end_time: '',
    project_id: '',
    notes: '',
    is_saturday: false,
    is_holiday: false,
  });

  // Lunch break mode: 'times' for start/end times, 'duration' for duration in minutes
  const [lunchBreakMode, setLunchBreakMode] = useState<'times' | 'duration'>('duration');
  const [lunchDuration, setLunchDuration] = useState<number>(60); // in minutes

  // Load projects and employee settings when dialog opens
  useEffect(() => {
    if (open && timesheet) {
      loadProjects();
      loadEmployeeSettings();
    }
  }, [open, timesheet]);

  // Load employee settings to get default lunch break
  const loadEmployeeSettings = async () => {
    if (!timesheet) return;
    
    try {
      // First try to get employee-specific settings
      const { data: employeeSettings } = await supabase
        .from('employee_settings')
        .select('lunch_break_type')
        .eq('user_id', timesheet.user_id)
        .single();

      let lunchBreakType = employeeSettings?.lunch_break_type;

      // If no employee-specific settings, get company settings
      if (!lunchBreakType) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', timesheet.user_id)
          .single();

        if (profile?.company_id) {
          const { data: companySettings } = await supabase
            .from('company_settings')
            .select('lunch_break_type')
            .eq('company_id', profile.company_id)
            .single();

          lunchBreakType = companySettings?.lunch_break_type;
        }
      }

      // Convert lunch_break_type to minutes
      const minutes = convertLunchBreakTypeToMinutes(lunchBreakType || '60_minuti');
      setDefaultLunchMinutes(minutes);
    } catch (error) {
      console.error('Error loading employee settings:', error);
      // Keep default of 60 minutes
    }
  };

  const convertLunchBreakTypeToMinutes = (lunchBreakType: string): number => {
    switch (lunchBreakType) {
      case '0_minuti': return 0;
      case '15_minuti': return 15;
      case '30_minuti': return 30;
      case '45_minuti': return 45;
      case '60_minuti': return 60;
      case '90_minuti': return 90;
      case '120_minuti': return 120;
      default: return 60;
    }
  };

  // Populate form when timesheet changes
  useEffect(() => {
    if (timesheet) {
      console.log('🔧 TIMESHEET DEBUG - Populating form:', {
        id: timesheet.id,
        start_time: timesheet.start_time,
        end_time: timesheet.end_time,
        notes: timesheet.notes,
        is_imported: timesheet.notes?.includes('Importato da Excel')
      });

      // Verifica se è un timesheet importato senza sessioni
      if (timesheet.notes?.includes('Importato da Excel') && !timesheet.timesheet_sessions?.length) {
        console.log('🔧 IMPORTED FIX - Handling imported timesheet without sessions');
        // Procedi normalmente usando i dati principali del timesheet
      }

      console.log('🔧 DIALOG SESSION FIX - Populating form with timesheet:', {
        id: timesheet.id,
        start_time: timesheet.start_time,
        end_time: timesheet.end_time,
        editing_session_id: (timesheet as any)._editing_session_id,
        editing_session_order: (timesheet as any)._editing_session_order
      });
      
      // CORREZIONE: Controlla se stiamo modificando una sessione specifica
      const isEditingSpecificSession = (timesheet as any)._editing_session_id !== undefined;
      
      if (isEditingSpecificSession) {
        console.log('🔧 DIALOG SESSION FIX - Editing specific session:', (timesheet as any)._editing_session_id, 'order:', (timesheet as any)._editing_session_order);
      } else {
        console.log('🔧 DIALOG SESSION FIX - Editing main timesheet');
      }
      
      setFormData({
        date: timesheet.date,
        end_date: timesheet.end_date || timesheet.date,
        // CORREZIONE: Usa gli orari corretti (che ora sono della sessione specifica)
        start_time: timesheet.start_time ? utcToLocalTime(timesheet.start_time) : '',
        end_time: timesheet.end_time ? utcToLocalTime(timesheet.end_time) : '',
        lunch_start_time: timesheet.lunch_start_time ? utcToLocalTime(timesheet.lunch_start_time) : '',
        lunch_end_time: timesheet.lunch_end_time ? utcToLocalTime(timesheet.lunch_end_time) : '',
        project_id: timesheet.project_id || 'none',
        notes: isEditingSpecificSession ? ((timesheet as any).session_notes || timesheet.notes || '') : (timesheet.notes || ''),
        is_saturday: timesheet.is_saturday,
        is_holiday: timesheet.is_holiday,
      });

      console.log('🔧 DIALOG SESSION FIX - Converted times:', {
        original_start_time: timesheet.start_time,
        converted_start_time: timesheet.start_time ? utcToLocalTime(timesheet.start_time) : '',
        original_end_time: timesheet.end_time,
        converted_end_time: timesheet.end_time ? utcToLocalTime(timesheet.end_time) : '',
        is_editing_session: isEditingSpecificSession
      });

      // Gestione modalità pausa pranzo
      if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
        setLunchBreakMode('times');
      } else if (timesheet.lunch_duration_minutes !== null && timesheet.lunch_duration_minutes !== undefined) {
        setLunchBreakMode('duration');
        setLunchDuration(timesheet.lunch_duration_minutes);
      } else {
        setLunchBreakMode('duration');
        setLunchDuration(defaultLunchMinutes);
      }
    }
  }, [timesheet, defaultLunchMinutes]);

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
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei progetti",
        variant: "destructive",
      });
    }
  };

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

  const handleSubmitSessionAware = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timesheet) return;

    setLoading(true);
    
    console.log('🔧 DIALOG SESSION FIX - Starting timesheet update');
    console.log('🔧 DIALOG SESSION FIX - Timesheet data:', {
      id: timesheet.id,
      editing_session_id: (timesheet as any)._editing_session_id,
      editing_session_order: (timesheet as any)._editing_session_order
    });
    
    const isEditingSpecificSession = (timesheet as any)._editing_session_id !== undefined;
    
    try {
      // Validazioni esistenti...
      if (formData.start_time && formData.end_time) {
        const startDateTime = new Date(`${formData.date}T${formData.start_time}:00`);
        const endDateTime = new Date(`${formData.end_date || formData.date}T${formData.end_time}:00`);
        
        if (endDateTime < startDateTime) {
          toast({ 
            title: 'Errore', 
            description: 'L\'orario di fine è precedente all\'inizio', 
            variant: 'destructive' 
          });
          setLoading(false);
          return;
        }
      }

      if (lunchBreakMode === 'times' && (!!formData.lunch_start_time !== !!formData.lunch_end_time)) {
        toast({ 
          title: 'Errore', 
          description: 'Specifica sia inizio che fine della pausa pranzo', 
          variant: 'destructive' 
        });
        setLoading(false);
        return;
      }

      const currentUserResult = await supabase.auth.getUser();
      if (currentUserResult.error) {
        throw new Error(`Errore autenticazione: ${currentUserResult.error.message}`);
      }

      if (isEditingSpecificSession) {
        console.log('🔧 DIALOG SESSION FIX - Updating specific session:', (timesheet as any)._editing_session_id);
        
        // CORREZIONE: Per sessioni specifiche, aggiorna solo la sessione
        const sessionUpdateData = {
          start_time: formData.start_time ? localTimeToUtc(formData.date, formData.start_time) : null,
          end_time: formData.end_time ? localTimeToUtc(formData.end_date || formData.date, formData.end_time) : null,
          notes: formData.notes || null,
          session_type: 'work' // Mantieni il tipo
        };

        console.log('🔧 DIALOG SESSION FIX - Session update data:', sessionUpdateData);

        const { error: sessionError } = await supabase
          .from('timesheet_sessions')
          .update(sessionUpdateData)
          .eq('id', (timesheet as any)._editing_session_id);

        if (sessionError) {
          console.error('🔧 DIALOG SESSION FIX - Session update error:', sessionError);
          throw sessionError;
        }

        console.log('🔧 DIALOG SESSION FIX - Session updated successfully');

        // Aggiorna anche alcuni campi del timesheet principale se necessario
        const realTimesheetId = extractRealTimesheetId(timesheet.id);
        const mainTimesheetUpdate = {
          project_id: formData.project_id === 'none' ? null : formData.project_id,
          is_saturday: formData.is_saturday,
          is_holiday: formData.is_holiday,
          updated_by: currentUserResult.data.user?.id ?? timesheet.user_id,
        };

        const { error: mainError } = await supabase
          .from('timesheets')
          .update(mainTimesheetUpdate)
          .eq('id', realTimesheetId);

        if (mainError) {
          console.error('🔧 DIALOG SESSION FIX - Main timesheet update error:', mainError);
          // Non bloccare per errori sul timesheet principale se la sessione è stata aggiornata
        }

      } else {
        console.log('🔧 DIALOG SESSION FIX - Updating main timesheet');
        
        // CORREZIONE: Per timesheet principali, usa la logica esistente
        const realTimesheetId = extractRealTimesheetId(timesheet.id);
        
        const updateData: any = {
          date: formData.date,
          end_date: formData.end_date,
          project_id: formData.project_id === 'none' ? null : formData.project_id,
          notes: formData.notes || null,
          is_saturday: formData.is_saturday,
          is_holiday: formData.is_holiday,
          updated_by: currentUserResult.data.user?.id ?? timesheet.user_id,
        };

        if (formData.start_time) {
          updateData.start_time = localTimeToUtc(formData.date, formData.start_time);
        } else {
          updateData.start_time = null;
        }

        if (formData.end_time) {
          const endDate = formData.end_date || formData.date;
          updateData.end_time = localTimeToUtc(endDate, formData.end_time);
        } else {
          updateData.end_time = null;
        }

        // Handle lunch times based on mode
        if (lunchBreakMode === 'times') {
          if (formData.lunch_start_time) {
            const lunchDate = formData.lunch_start_time < formData.start_time && formData.end_date !== formData.date 
              ? formData.end_date 
              : formData.date;
            updateData.lunch_start_time = localTimeToUtc(lunchDate, formData.lunch_start_time);
          } else {
            updateData.lunch_start_time = null;
          }

          if (formData.lunch_end_time) {
            const lunchDate = formData.lunch_end_time < formData.start_time && formData.end_date !== formData.date 
              ? formData.end_date 
              : formData.date;
            updateData.lunch_end_time = localTimeToUtc(lunchDate, formData.lunch_end_time);
          } else {
            updateData.lunch_end_time = null;
          }
          
          updateData.lunch_duration_minutes = null;
        } else {
          updateData.lunch_start_time = null;
          updateData.lunch_end_time = null;
          updateData.lunch_duration_minutes = lunchDuration;
          updateData.lunch_manually_set = true;  // 🔒 PROTEZIONE
        }

        console.log('🔧 DIALOG SESSION FIX - Main timesheet update data:', updateData);

        const { error } = await supabase
          .from('timesheets')
          .update(updateData)
          .eq('id', realTimesheetId);

        if (error) {
          console.error('🔧 DIALOG SESSION FIX - Main timesheet update error:', error);
          throw error;
        }

        console.log('🔧 DIALOG SESSION FIX - Main timesheet updated successfully');
      }

      toast({
        title: "Successo",
        description: isEditingSpecificSession 
          ? `Sessione #${(timesheet as any)._editing_session_order} modificata con successo`
          : "Timesheet modificato con successo",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('🔧 DIALOG SESSION FIX - Catch block error:', error);
      
      let errorMessage = 'Errore sconosciuto';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.details) {
        errorMessage = error.details;
      }
      
      console.error('🔧 DIALOG SESSION FIX - Final error message:', errorMessage);
      
      toast({
        title: "Errore",
        description: `Errore nella modifica: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!timesheet) return null;

  // Controllo per timesheet importati con problemi
  if (timesheet?.notes?.includes('Importato da Excel') && !timesheet.start_time) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Timesheet Importato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Questo timesheet è stato importato da Excel ma presenta inconsistenze nei dati.</p>
            <p>ID: {timesheet.id}</p>
            <p>Note: {timesheet.notes}</p>
            <p>Per modificarlo, eliminalo e ricrealo manualmente.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica Timesheet</DialogTitle>
          <DialogDescription>
            Modifica il timesheet di {timesheet.profiles?.first_name} {timesheet.profiles?.last_name}
            <br />
            <span className="text-xs text-muted-foreground">
              Gli orari sono mostrati in timezone locale (Europe/Rome)
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmitSessionAware} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data inizio</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Data fine</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => handleInputChange('end_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project">Progetto</Label>
              <Select value={formData.project_id} onValueChange={(value) => handleInputChange('project_id', value)}>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Orario di inizio</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => handleInputChange('start_time', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">Orario di fine</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => handleInputChange('end_time', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Modalità pausa pranzo</Label>
              <RadioGroup 
                value={lunchBreakMode} 
                onValueChange={(value: 'times' | 'duration') => setLunchBreakMode(value)}
                className="flex flex-col space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="times" id="times" />
                  <Label htmlFor="times">Specifica orari di inizio e fine</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="duration" id="duration" />
                  <Label htmlFor="duration">Specifica solo la durata</Label>
                </div>
              </RadioGroup>
            </div>

            {lunchBreakMode === 'times' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lunch_start_time">Inizio pausa pranzo</Label>
                  <Input
                    id="lunch_start_time"
                    type="time"
                    value={formData.lunch_start_time}
                    onChange={(e) => handleInputChange('lunch_start_time', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lunch_end_time">Fine pausa pranzo</Label>
                  <Input
                    id="lunch_end_time"
                    type="time"
                    value={formData.lunch_end_time}
                    onChange={(e) => handleInputChange('lunch_end_time', e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="lunch_duration">Durata pausa pranzo</Label>
                <div className="text-sm text-muted-foreground mb-2">
                  Pausa predefinita del dipendente: {defaultLunchMinutes} minuti
                </div>
                <Select 
                  value={lunchDuration.toString()} 
                  onValueChange={(value) => setLunchDuration(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona durata" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Nessuna pausa</SelectItem>
                    <SelectItem value="15">15 minuti</SelectItem>
                    <SelectItem value="30">30 minuti</SelectItem>
                    <SelectItem value="45">45 minuti</SelectItem>
                    <SelectItem value="60">1 ora</SelectItem>
                    <SelectItem value="90">1 ora e 30 minuti</SelectItem>
                    <SelectItem value="120">2 ore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Location tracking section */}
          {(timesheet.start_location_lat || timesheet.start_location_lng || timesheet.end_location_lat || timesheet.end_location_lng) && (
            <div className="space-y-4 border-t pt-4">
              <LocationDisplay
                startLat={timesheet.start_location_lat}
                startLng={timesheet.start_location_lng}
                endLat={timesheet.end_location_lat}
                endLng={timesheet.end_location_lng}
              />
              
              <LocationTrackingRoute
                timesheetId={timesheet.id}
                startLat={timesheet.start_location_lat}
                startLng={timesheet.start_location_lng}
                endLat={timesheet.end_location_lat}
                endLng={timesheet.end_location_lng}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Inserisci eventuali note..."
              rows={3}
            />
          </div>

          <div className="flex gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_saturday"
                checked={formData.is_saturday}
                onCheckedChange={(checked) => handleInputChange('is_saturday', Boolean(checked))}
              />
              <Label htmlFor="is_saturday">Sabato</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_holiday"
                checked={formData.is_holiday}
                onCheckedChange={(checked) => handleInputChange('is_holiday', Boolean(checked))}
              />
              <Label htmlFor="is_holiday">Festivo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva modifiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}