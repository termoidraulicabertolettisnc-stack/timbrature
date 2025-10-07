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
import { fromZonedTime } from 'date-fns-tz';
import { cn } from '@/lib/utils';

interface TimesheetInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
}

// Funzione helper per conversione timezone
const localTimeToUtc = (dateString: string, timeString: string): string => {
  try {
    const localDateTime = `${dateString}T${timeString}:00`;
    // Usa fromZonedTime per convertire da timezone locale a UTC
    const localDate = new Date(localDateTime);
    const utcDate = fromZonedTime(localDate, 'Europe/Rome');
    return utcDate.toISOString();
  } catch (error) {
    console.error('Error converting local time to UTC:', error);
    return new Date().toISOString();
  }
};

export function TimesheetInsertDialog({ open, onOpenChange, onSuccess, selectedDate }: TimesheetInsertDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [lunchDuration, setLunchDuration] = useState(60);
  
  const [formData, setFormData] = useState({
    project_id: '',
    date: '',
    start_time: '',
    end_time: '',
    notes: ''
  });

  useEffect(() => {
    if (open) {
      loadData();
      // Reset form
      setSelectedEmployee('');
      setLunchDuration(60);
      setFormData({
        project_id: '',
        date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        start_time: '',
        end_time: '',
        notes: ''
      });
    }
  }, [open, selectedDate]);

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

  // CORREZIONE per TimesheetInsertDialog - Fix project_id
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('🔧 INSERT FIX - Starting timesheet insertion');
    console.log('🔧 INSERT FIX - Form data:', {
      date: formData.date,
      start_time: formData.start_time,
      end_time: formData.end_time,
      employee: selectedEmployee,
      project: formData.project_id
    });
    
    if (!selectedEmployee || !formData.start_time) {
      toast({
        title: "Errore",
        description: "Dipendente e ora di inizio sono obbligatori",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Verifica se esiste già un timesheet per questa data/utente
      const { data: existingTimesheets, error: checkError } = await supabase
        .from('timesheets')
        .select('id, date, start_time, end_time')
        .eq('user_id', selectedEmployee)
        .eq('date', formData.date);
      
      console.log('🔧 INSERT FIX - Existing timesheets check:', {
        data: existingTimesheets,
        error: checkError,
        count: existingTimesheets?.length || 0
      });
      
      if (checkError) {
        console.error('🔧 INSERT FIX - Error checking existing timesheets:', checkError);
        throw new Error(`Errore nella verifica timesheet esistenti: ${checkError.message}`);
      }
      
      // Ottieni utente corrente
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('🔧 INSERT FIX - Current user:', user?.id);
      
      if (authError || !user) {
        throw new Error('Utente non autenticato');
      }
      
      // Converti gli orari in UTC
      let startTimeUTC = null;
      let endTimeUTC = null;
      
      if (formData.start_time) {
        startTimeUTC = localTimeToUtc(formData.date, formData.start_time);
        console.log('🔧 INSERT FIX - Start time conversion:', {
          input: `${formData.date} ${formData.start_time}`,
          output: startTimeUTC
        });
      }
      
      if (formData.end_time) {
        endTimeUTC = localTimeToUtc(formData.date, formData.end_time);
        console.log('🔧 INSERT FIX - End time conversion:', {
          input: `${formData.date} ${formData.end_time}`,
          output: endTimeUTC
        });
      }
      
      // CORREZIONE PRINCIPALE: Fix project_id
      let projectId = null;
      if (formData.project_id && formData.project_id !== '' && formData.project_id !== 'none') {
        projectId = formData.project_id;
      }
      
      console.log('🔧 INSERT FIX - Project ID correction:', {
        original: formData.project_id,
        corrected: projectId
      });
      
      // Prepare timesheet data (SENZA start_time/end_time - legacy)
      const insertData = {
        user_id: selectedEmployee,
        date: formData.date,
        project_id: projectId,
        notes: formData.notes || null,
        lunch_duration_minutes: lunchDuration || 60,
        created_by: user.id,
        updated_by: user.id
      };
      
      console.log('🔧 SESSION-FIRST - Timesheet data prepared (no times):', insertData);
      
      // Trova o crea il timesheet per questa data
      let timesheetId: string;
      
      if (existingTimesheets && existingTimesheets.length > 0) {
        // Usa il timesheet esistente
        timesheetId = existingTimesheets[0].id;
        console.log('🔧 SESSION-FIRST - Using existing timesheet:', timesheetId);
      } else {
        // Crea nuovo timesheet
        const { data: newTimesheet, error: insertError } = await supabase
          .from('timesheets')
          .insert(insertData)
          .select('id')
          .single();
        
        if (insertError) {
          throw new Error(`Errore creazione timesheet: ${insertError.message}`);
        }
        
        timesheetId = newTimesheet.id;
        console.log('🔧 SESSION-FIRST - Created new timesheet:', timesheetId);
      }
      
      // Calcola session_order
      const { data: existingSessions } = await supabase
        .from('timesheet_sessions')
        .select('session_order')
        .eq('timesheet_id', timesheetId)
        .order('session_order', { ascending: false })
        .limit(1);
      
      const nextOrder = existingSessions && existingSessions.length > 0 
        ? existingSessions[0].session_order + 1 
        : 0;
      
      console.log('🔧 SESSION-FIRST - Next session order:', nextOrder);
      
      // Converti UTC timestamp a time format (HH:mm:ss)
      const startTimeOnly = format(new Date(startTimeUTC), 'HH:mm:ss');
      const endTimeOnly = endTimeUTC ? format(new Date(endTimeUTC), 'HH:mm:ss') : null;
      
      // SEMPRE crea la sessione
      const sessionData = {
        timesheet_id: timesheetId,
        session_order: nextOrder,
        start_time: startTimeOnly,
        end_time: endTimeOnly,
        session_type: 'work',
        notes: formData.notes || null
      };
      
      console.log('🔧 SESSION-FIRST - Creating session:', sessionData);
      
      const { error: sessionError } = await supabase
        .from('timesheet_sessions')
        .insert(sessionData);
      
      if (sessionError) {
        throw new Error(`Errore creazione sessione: ${sessionError.message}`);
      }
      
      console.log('🔧 SESSION-FIRST - Session created successfully');
      
      toast({
        title: "Successo",
        description: "Timbratura inserita con successo",
      });
      
      onSuccess();
      onOpenChange(false);
      
    } catch (error: any) {
      console.error('🔧 INSERT FIX - Catch block error:', error);
      
      let errorMessage = 'Errore sconosciuto nell\'inserimento';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      console.error('🔧 INSERT FIX - Final error message:', errorMessage);
      
      toast({
        title: "Errore",
        description: `Errore nell'inserimento del timesheet: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // CORREZIONE: Fix anche nel form handling
  const handleSelectChange = (field: string, value: string) => {
    console.log('🔧 INSERT FIX - Select change:', { field, value });
    
    // Correggi il valore per project_id
    if (field === 'project_id') {
      // Se è stringa vuota o 'none', imposta come stringa vuota (che diventerà null nell'insert)
      if (value === '' || value === 'none' || !value) {
        setFormData(prev => ({ ...prev, [field]: '' }));
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
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
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
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
            <Select value={formData.project_id} onValueChange={(value) => handleSelectChange('project_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona commessa (opzionale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna commessa</SelectItem>
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
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              required
            />
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
              value={lunchDuration.toString()} 
              onValueChange={(value) => setLunchDuration(parseInt(value))}
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