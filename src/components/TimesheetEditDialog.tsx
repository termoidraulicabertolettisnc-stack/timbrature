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
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import LocationDisplay from './LocationDisplay';
import LocationTrackingRoute from './LocationTrackingRoute';
import { TimesheetWithProfile } from '@/types/timesheet';
import { TimesheetSession } from '@/types/timesheet-session';
import { TimesheetSessionsManager } from './TimesheetSessionsManager';

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
  
  const [formData, setFormData] = useState({
    date: '',
    end_date: '',
    project_id: '',
    notes: '',
    is_saturday: false,
    is_holiday: false,
  });
  
  const [sessions, setSessions] = useState<Partial<TimesheetSession>[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Load projects and sessions when dialog opens
  useEffect(() => {
    if (open && timesheet) {
      loadProjects();
      loadTimesheetSessions();
    }
  }, [open, timesheet]);

  // Load timesheet sessions
  const loadTimesheetSessions = async () => {
    if (!timesheet) return;
    
    setLoadingSessions(true);
    try {
      const { data: sessionsData, error } = await supabase
        .from('timesheet_sessions')
        .select('*')
        .eq('timesheet_id', timesheet.id)
        .order('session_order');
      
      if (error) throw error;
      
      if (sessionsData && sessionsData.length > 0) {
        // Type cast the sessions data to match our interface
        const typedSessions: Partial<TimesheetSession>[] = sessionsData.map(session => ({
          ...session,
          session_type: session.session_type as 'work' | 'lunch_break' | 'other_break'
        }));
        setSessions(typedSessions);
      } else {
        // No sessions found, create a default session from timesheet data
        const defaultSession: Partial<TimesheetSession> = {
          session_order: 1,
          session_type: 'work',
          start_time: timesheet.start_time || undefined,
          end_time: timesheet.end_time || undefined,
          notes: null
        };
        setSessions([defaultSession]);
      }
    } catch (error) {
      console.error('Error loading timesheet sessions:', error);
      // Fallback to default session
      const defaultSession: Partial<TimesheetSession> = {
        session_order: 1,
        session_type: 'work',
        start_time: timesheet.start_time || undefined,
        end_time: timesheet.end_time || undefined,
        notes: null
      };
      setSessions([defaultSession]);
    } finally {
      setLoadingSessions(false);
    }
  };

  // Populate form when timesheet changes
  useEffect(() => {
    if (timesheet) {
      setFormData({
        date: timesheet.date,
        end_date: timesheet.end_date || timesheet.date,
        project_id: timesheet.project_id || 'none',
        notes: timesheet.notes || '',
        is_saturday: timesheet.is_saturday,
        is_holiday: timesheet.is_holiday,
      });
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
      await handleSessionsSubmit();
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

  const handleSessionsSubmit = async () => {
    // Get current user
    const currentUser = (await supabase.auth.getUser()).data.user;

    // Update basic timesheet info
    const updateData: any = {
      date: formData.date,
      end_date: formData.end_date,
      project_id: formData.project_id === 'none' ? null : formData.project_id,
      notes: formData.notes || null,
      is_saturday: formData.is_saturday,
      is_holiday: formData.is_holiday,
      updated_by: currentUser?.id ?? timesheet!.user_id,
      // Clear old time fields - sessions will handle this
      start_time: null,
      end_time: null,
      lunch_start_time: null,
      lunch_end_time: null,
      lunch_duration_minutes: null
    };

    const { error: timesheetError } = await supabase
      .from('timesheets')
      .update(updateData)
      .eq('id', timesheet!.id);

    if (timesheetError) throw timesheetError;

    // Delete existing sessions
    const { error: deleteError } = await supabase
      .from('timesheet_sessions')
      .delete()
      .eq('timesheet_id', timesheet!.id);

    if (deleteError) throw deleteError;

    // Insert new sessions
    const validSessions = sessions.filter(session => 
      session.start_time && session.end_time && session.session_type
    );

    if (validSessions.length > 0) {
      const sessionsToInsert = validSessions.map(session => ({
        timesheet_id: timesheet!.id,
        session_order: session.session_order!,
        session_type: session.session_type!,
        start_time: session.start_time!,
        end_time: session.end_time!,
        notes: session.notes || null,
        start_location_lat: session.start_location_lat || null,
        start_location_lng: session.start_location_lng || null,
        end_location_lat: session.end_location_lat || null,
        end_location_lng: session.end_location_lng || null
      }));

      const { error: sessionsError } = await supabase
        .from('timesheet_sessions')
        .insert(sessionsToInsert);

      if (sessionsError) throw sessionsError;
    }

    toast({
      title: "Successo",
      description: "Timesheet modificato con successo",
    });

    onSuccess();
    onOpenChange(false);
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

          {/* Sessioni di lavoro - Sempre visibili */}
          <div className="space-y-4">
            <TimesheetSessionsManager
              sessions={sessions}
              onChange={setSessions}
              date={formData.date}
            />
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