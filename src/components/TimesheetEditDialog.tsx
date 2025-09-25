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
      console.log('🔧 TIMEZONE FIX - Populating form with timesheet:', timesheet);
      
      setFormData({
        date: timesheet.date,
        end_date: timesheet.end_date || timesheet.date,
        // CORREZIONE: Usa la nuova funzione di conversione timezone
        start_time: timesheet.start_time ? utcToLocalTime(timesheet.start_time) : '',
        end_time: timesheet.end_time ? utcToLocalTime(timesheet.end_time) : '',
        lunch_start_time: timesheet.lunch_start_time ? utcToLocalTime(timesheet.lunch_start_time) : '',
        lunch_end_time: timesheet.lunch_end_time ? utcToLocalTime(timesheet.lunch_end_time) : '',
        project_id: timesheet.project_id || 'none',
        notes: timesheet.notes || '',
        is_saturday: timesheet.is_saturday,
        is_holiday: timesheet.is_holiday,
      });

      console.log('🔧 TIMEZONE FIX - Converted times:', {
        original_start_time: timesheet.start_time,
        converted_start_time: timesheet.start_time ? utcToLocalTime(timesheet.start_time) : '',
        original_end_time: timesheet.end_time,
        converted_end_time: timesheet.end_time ? utcToLocalTime(timesheet.end_time) : '',
      });

      // Determine lunch break mode and duration based on existing data
      if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
        // Timesheet has specific times - use times mode
        setLunchBreakMode('times');
      } else if (timesheet.lunch_duration_minutes !== null && timesheet.lunch_duration_minutes !== undefined) {
        // Timesheet has explicit duration set (including 0 for no break) - use that value
        setLunchBreakMode('duration');
        setLunchDuration(timesheet.lunch_duration_minutes);
      } else {
        // No lunch data in timesheet - use duration mode with employee default
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timesheet) return;

    setLoading(true);
    
    console.log('🔧 ID FIX - Starting timesheet update');
    console.log('🔧 ID FIX - Original timesheet ID:', timesheet.id);
    
    // CORREZIONE PRINCIPALE: Estrai l'ID reale
    const realTimesheetId = extractRealTimesheetId(timesheet.id);
    console.log('🔧 ID FIX - Using real timesheet ID for update:', realTimesheetId);
    
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

      // Prepare update data
      const updateData: any = {
        date: formData.date,
        end_date: formData.end_date,
        project_id: formData.project_id === 'none' ? null : formData.project_id,
        notes: formData.notes || null,
        is_saturday: formData.is_saturday,
        is_holiday: formData.is_holiday,
        updated_by: currentUserResult.data.user?.id ?? timesheet.user_id,
      };

      // Handle timezone conversion
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

      // Handle lunch times
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
      }

      console.log('🔧 ID FIX - Final update data:', updateData);

      // CORREZIONE: Usa l'ID reale nella query
      const { data: updatedData, error } = await supabase
        .from('timesheets')
        .update(updateData)
        .eq('id', realTimesheetId) // ← FIX: Usa ID reale invece di composito
        .select();

      console.log('🔧 ID FIX - Supabase response:', { data: updatedData, error });

      if (error) {
        console.error('🔧 ID FIX - Supabase error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('🔧 ID FIX - Update successful:', updatedData);

      toast({
        title: "Successo",
        description: "Timesheet modificato con successo",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('🔧 ID FIX - Catch block error:', error);
      
      let errorMessage = 'Errore sconosciuto';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.details) {
        errorMessage = error.details;
      }
      
      console.error('🔧 ID FIX - Final error message:', errorMessage);
      
      toast({
        title: "Errore",
        description: `Errore nella modifica del timesheet: ${errorMessage}`,
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

        <form onSubmit={handleSubmit} className="space-y-4">
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