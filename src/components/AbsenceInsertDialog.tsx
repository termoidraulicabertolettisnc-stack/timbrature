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
import { format, addDays, eachDayOfInterval } from 'date-fns';
import { cn } from '@/lib/utils';

interface AbsenceInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  selectedDate?: Date;
}

export function AbsenceInsertDialog({ open, onOpenChange, onSuccess, selectedDate }: AbsenceInsertDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    user_id: '',
    absence_type: 'F' as 'F' | 'I' | 'M' | 'PNR',
    date_from: new Date(),
    date_to: new Date(),
    hours: 8,
    notes: ''
  });

  useEffect(() => {
    if (open) {
      loadEmployees();
      // Reset form
      setFormData({
        user_id: '',
        absence_type: 'F',
        date_from: selectedDate || new Date(),
        date_to: selectedDate || new Date(),
        hours: 8,
        notes: ''
      });
    }
  }, [open]);

  const loadEmployees = async () => {
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('is_active', true)
        .order('first_name');

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);

    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dipendenti",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.user_id || !formData.absence_type) {
      toast({
        title: "Errore",
        description: "Dipendente e tipo di assenza sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Ottieni l'utente corrente autenticato
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!currentUser) throw new Error('Utente non autenticato');

      // Ottieni il company_id del dipendente selezionato
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', formData.user_id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile error:', profileError);
        throw profileError;
      }
      if (!profileData?.company_id) {
        console.error('No company_id found for user:', formData.user_id);
        throw new Error('Company ID non trovato per il dipendente');
      }

      // Ottieni tutti i giorni nel periodo selezionato
      const days = eachDayOfInterval({
        start: formData.date_from,
        end: formData.date_to
      });

      // Controlla se esistono già assenze dello stesso tipo per le stesse date
      const dateStrings = days.map(day => format(day, 'yyyy-MM-dd'));
      
      const { data: existingAbsences, error: checkError } = await supabase
        .from('employee_absences')
        .select('date, absence_type')
        .eq('user_id', formData.user_id)
        .eq('absence_type', formData.absence_type)
        .in('date', dateStrings);

      if (checkError) {
        console.error('Error checking existing absences:', checkError);
        throw checkError;
      }

      // Filtra le date che non hanno già assenze dello stesso tipo
      const existingDates = new Set(existingAbsences?.map(abs => abs.date) || []);
      const availableDays = days.filter(day => !existingDates.has(format(day, 'yyyy-MM-dd')));
      const conflictingDays = days.filter(day => existingDates.has(format(day, 'yyyy-MM-dd')));

      // Se ci sono conflitti, chiedi conferma all'utente
      if (conflictingDays.length > 0) {
        const conflictDatesStr = conflictingDays.map(d => format(d, 'dd/MM/yyyy')).join(', ');
        
        if (availableDays.length === 0) {
          // Tutti i giorni sono in conflitto
          toast({
            title: "Assenze già esistenti",
            description: `Esiste già un'assenza di tipo "${getAbsenceTypeLabel(formData.absence_type)}" per tutte le date selezionate (${conflictDatesStr}). Seleziona date diverse.`,
            variant: "destructive",
          });
          return;
        } else {
          // Alcuni giorni sono in conflitto
          const proceed = window.confirm(
            `Attenzione: Esistono già assenze di tipo "${getAbsenceTypeLabel(formData.absence_type)}" per le seguenti date: ${conflictDatesStr}.\n\n` +
            `Vuoi procedere inserendo le assenze solo per le date disponibili (${availableDays.length} giorni)?`
          );
          
          if (!proceed) {
            setLoading(false);
            return;
          }
        }
      }

      // Prepara i dati per l'inserimento solo per le date disponibili
      const absences = availableDays.map(day => ({
        user_id: formData.user_id,
        company_id: profileData.company_id,
        date: format(day, 'yyyy-MM-dd'),
        absence_type: formData.absence_type,
        hours: formData.hours,
        notes: formData.notes || null,
        created_by: currentUser.id
      }));

      if (absences.length === 0) {
        toast({
          title: "Nessuna assenza da inserire",
          description: "Tutte le date selezionate hanno già assenze dello stesso tipo.",
          variant: "destructive",
        });
        return;
      }

      // Inserisci le assenze disponibili
      const { error } = await supabase
        .from('employee_absences')
        .insert(absences);

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      let successMessage = `${absences.length} giorni di assenza inseriti con successo`;
      if (conflictingDays.length > 0) {
        successMessage += ` (saltati ${conflictingDays.length} giorni già presenti)`;
      }

      toast({
        title: "Successo",
        description: successMessage,
      });

      onSuccess();
      onOpenChange(false);

    } catch (error) {
      console.error('Error inserting absence:', error);
      toast({
        title: "Errore",
        description: `Errore nell'inserimento dell'assenza: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getAbsenceTypeLabel = (type: string) => {
    const labels = {
      'F': 'Ferie/Permesso',
      'M': 'Malattia',
      'I': 'Infortunio',
      'PNR': 'Permesso non retribuito'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTotalDays = () => {
    const days = eachDayOfInterval({
      start: formData.date_from,
      end: formData.date_to
    });
    return days.length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Inserisci Assenza</DialogTitle>
          <DialogDescription>
            Compila i dati per inserire ferie, malattia o altre assenze
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
            <Label htmlFor="absence_type">Tipo Assenza *</Label>
            <Select value={formData.absence_type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, absence_type: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="F">Ferie/Permesso</SelectItem>
                <SelectItem value="M">Malattia</SelectItem>
                <SelectItem value="I">Infortunio</SelectItem>
                <SelectItem value="PNR">Permesso non retribuito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Inizio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date_from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.date_from, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date_from}
                    onSelect={(date) => {
                      if (date) {
                        setFormData(prev => ({ 
                          ...prev, 
                          date_from: date,
                          // Se la data di fine è prima della data di inizio, aggiornala
                          date_to: date > prev.date_to ? date : prev.date_to
                        }));
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data Fine</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date_to && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(formData.date_to, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date_to}
                    onSelect={(date) => {
                      if (date && date >= formData.date_from) {
                        setFormData(prev => ({ ...prev, date_to: date }));
                      }
                    }}
                    disabled={(date) => date < formData.date_from}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hours">Ore per Giorno</Label>
            <Input
              id="hours"
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={formData.hours}
              onChange={(e) => setFormData(prev => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))}
            />
          </div>

          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm">
              <p><strong>Riepilogo:</strong></p>
              <p>Tipo: {getAbsenceTypeLabel(formData.absence_type)}</p>
              <p>Giorni: {getTotalDays()}</p>
              <p>Ore totali: {(getTotalDays() * formData.hours).toFixed(1)}</p>
            </div>
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