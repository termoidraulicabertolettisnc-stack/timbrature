import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
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

interface TimesheetWithProfile {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  notes: string | null;
  user_id: string;
  project_id: string | null;
  is_saturday: boolean;
  is_holiday: boolean;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  projects: {
    name: string;
  } | null;
}

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

export function TimesheetEditDialog({ timesheet, open, onOpenChange, onSuccess }: TimesheetEditDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  
  // Form state
  const [formData, setFormData] = useState({
    date: '',
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
  const [lunchBreakMode, setLunchBreakMode] = useState<'times' | 'duration'>('times');
  const [lunchDuration, setLunchDuration] = useState<number>(0); // in minutes

  // Load projects when dialog opens
  useEffect(() => {
    if (open) {
      loadProjects();
    }
  }, [open]);

  // Populate form when timesheet changes
  useEffect(() => {
    if (timesheet) {
      setFormData({
        date: timesheet.date,
        start_time: timesheet.start_time ? format(parseISO(timesheet.start_time), 'HH:mm') : '',
        end_time: timesheet.end_time ? format(parseISO(timesheet.end_time), 'HH:mm') : '',
        lunch_start_time: timesheet.lunch_start_time ? format(parseISO(timesheet.lunch_start_time), 'HH:mm') : '',
        lunch_end_time: timesheet.lunch_end_time ? format(parseISO(timesheet.lunch_end_time), 'HH:mm') : '',
        project_id: timesheet.project_id || 'none',
        notes: timesheet.notes || '',
        is_saturday: timesheet.is_saturday,
        is_holiday: timesheet.is_holiday,
      });

      // Determine lunch break mode based on existing data
      if (timesheet.lunch_start_time && timesheet.lunch_end_time) {
        setLunchBreakMode('times');
      } else {
        setLunchBreakMode('duration');
        setLunchDuration(0); // Default to no lunch break
      }
    }
  }, [timesheet]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timesheet) return;

    setLoading(true);
    try {
      // Prepare the update data
      const updateData: any = {
        date: formData.date,
        project_id: formData.project_id === 'none' ? null : formData.project_id,
        notes: formData.notes || null,
        is_saturday: formData.is_saturday,
        is_holiday: formData.is_holiday,
        updated_by: timesheet.user_id,
      };

      // Handle start_time
      if (formData.start_time) {
        updateData.start_time = new Date(`${formData.date}T${formData.start_time}:00`).toISOString();
      } else {
        updateData.start_time = null;
      }

      // Handle end_time
      if (formData.end_time) {
        updateData.end_time = new Date(`${formData.date}T${formData.end_time}:00`).toISOString();
      } else {
        updateData.end_time = null;
      }

      // Handle lunch times based on mode
      if (lunchBreakMode === 'times') {
        // Use specific start/end times
        if (formData.lunch_start_time) {
          updateData.lunch_start_time = new Date(`${formData.date}T${formData.lunch_start_time}:00`).toISOString();
        } else {
          updateData.lunch_start_time = null;
        }

        if (formData.lunch_end_time) {
          updateData.lunch_end_time = new Date(`${formData.date}T${formData.lunch_end_time}:00`).toISOString();
        } else {
          updateData.lunch_end_time = null;
        }
        
        // Clear custom duration when using times
        updateData.lunch_duration_minutes = null;
      } else {
        // Use duration mode - clear specific times and set custom duration
        updateData.lunch_start_time = null;
        updateData.lunch_end_time = null;
        updateData.lunch_duration_minutes = lunchDuration > 0 ? lunchDuration : null;
      }

      const { error } = await supabase
        .from('timesheets')
        .update(updateData)
        .eq('id', timesheet.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Timesheet modificato con successo",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating timesheet:', error);
      toast({
        title: "Errore",
        description: "Errore nella modifica del timesheet",
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
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => handleInputChange('date', e.target.value)}
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
                onCheckedChange={(checked) => handleInputChange('is_saturday', checked)}
              />
              <Label htmlFor="is_saturday">Sabato</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_holiday"
                checked={formData.is_holiday}
                onCheckedChange={(checked) => handleInputChange('is_holiday', checked)}
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