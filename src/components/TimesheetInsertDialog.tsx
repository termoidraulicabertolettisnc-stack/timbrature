import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TimesheetInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TimesheetInsertDialog({ open, onOpenChange, onSuccess }: TimesheetInsertDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    user_id: '',
    project_id: '',
    date: new Date(),
    start_time: '',
    end_time: '',
    lunch_duration_minutes: 60,
    notes: ''
  });

  useEffect(() => {
    if (open) {
      loadData();
      // Reset form
      setFormData({
        user_id: '',
        project_id: '',
        date: new Date(),
        start_time: '',
        end_time: '',
        lunch_duration_minutes: 60,
        notes: ''
      });
    }
  }, [open]);

  const loadData = async () => {
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
      console.error('Error loading data:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.user_id || !formData.start_time) {
      toast({
        title: "Errore",
        description: "Dipendente e ora di inizio sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const dateStr = format(formData.date, 'yyyy-MM-dd');
      
      // Costruisci i timestamp completi
      const startTimestamp = `${dateStr}T${formData.start_time}:00`;
      let endTimestamp = null;
      
      if (formData.end_time) {
        endTimestamp = `${dateStr}T${formData.end_time}:00`;
        
        // Se l'ora di fine è minore dell'ora di inizio, assume sia il giorno dopo
        if (formData.end_time < formData.start_time) {
          const nextDay = new Date(formData.date);
          nextDay.setDate(nextDay.getDate() + 1);
          endTimestamp = `${format(nextDay, 'yyyy-MM-dd')}T${formData.end_time}:00`;
        }
      }

      const timesheetData = {
        user_id: formData.user_id,
        project_id: formData.project_id || null,
        date: dateStr,
        start_time: startTimestamp,
        end_time: endTimestamp,
        lunch_duration_minutes: formData.lunch_duration_minutes,
        notes: formData.notes || null,
        created_by: formData.user_id,
        is_absence: false
      };

      const { error } = await supabase
        .from('timesheets')
        .insert([timesheetData]);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Timesheet inserito con successo",
      });

      onSuccess();
      onOpenChange(false);

    } catch (error) {
      console.error('Error inserting timesheet:', error);
      toast({
        title: "Errore",
        description: "Errore nell'inserimento del timesheet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Inserisci Nuova Timbratura</DialogTitle>
          <DialogDescription>
            Compila i dati per inserire una nuova timbratura
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user_id">Dipendente *</Label>
            <Select value={formData.user_id} onValueChange={(value) => setFormData(prev => ({ ...prev, user_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona dipendente" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.user_id} value={employee.user_id}>
                    {employee.first_name} {employee.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project_id">Commessa</Label>
            <Select value={formData.project_id} onValueChange={(value) => setFormData(prev => ({ ...prev, project_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona commessa (opzionale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nessuna commessa</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !formData.date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(formData.date, 'dd/MM/yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.date}
                  onSelect={(date) => {
                    if (date) {
                      setFormData(prev => ({ ...prev, date }));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Ora Inizio *</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">Ora Fine</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lunch_duration">Pausa Pranzo (minuti)</Label>
            <Select 
              value={formData.lunch_duration_minutes.toString()} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, lunch_duration_minutes: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Nessuna pausa</SelectItem>
                <SelectItem value="15">15 minuti</SelectItem>
                <SelectItem value="30">30 minuti</SelectItem>
                <SelectItem value="45">45 minuti</SelectItem>
                <SelectItem value="60">1 ora</SelectItem>
                <SelectItem value="90">1h 30min</SelectItem>
                <SelectItem value="120">2 ore</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              placeholder="Note aggiuntive..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Inserimento...' : 'Inserisci'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}