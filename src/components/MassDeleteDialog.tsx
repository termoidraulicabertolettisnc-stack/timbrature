import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, AlertTriangle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Employee {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface MassDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void | Promise<void>;
}

type DeleteScope = 'both' | 'timesheets' | 'absences';

export function MassDeleteDialog({ open, onOpenChange, onSuccess }: MassDeleteDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date>(new Date());
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [scope, setScope] = useState<DeleteScope>('both');
  const [confirmed, setConfirmed] = useState(false);

  const [preview, setPreview] = useState<{ timesheets: number; absences: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadEmployees();
      setSelectedEmployeeId('');
      setDateFrom(new Date());
      setDateTo(new Date());
      setScope('both');
      setConfirmed(false);
      setPreview(null);
    }
  }, [open]);

  const loadEmployees = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, email')
      .eq('is_active', true)
      .order('last_name')
      .order('first_name');
    if (error) {
      toast({ title: 'Errore', description: 'Impossibile caricare i dipendenti', variant: 'destructive' });
      return;
    }
    setEmployees(data || []);
  };

  const canPreview = selectedEmployeeId && dateFrom && dateTo && dateFrom <= dateTo;

  const loadPreview = async () => {
    if (!canPreview) return;
    setPreviewLoading(true);
    setConfirmed(false);
    try {
      const from = format(dateFrom, 'yyyy-MM-dd');
      const to = format(dateTo, 'yyyy-MM-dd');

      let tsCount = 0;
      let absCount = 0;

      if (scope !== 'absences') {
        const { count, error } = await supabase
          .from('timesheets')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', selectedEmployeeId)
          .gte('date', from)
          .lte('date', to);
        if (error) throw error;
        tsCount = count || 0;
      }

      if (scope !== 'timesheets') {
        const { count, error } = await supabase
          .from('employee_absences')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', selectedEmployeeId)
          .gte('date', from)
          .lte('date', to);
        if (error) throw error;
        absCount = count || 0;
      }

      setPreview({ timesheets: tsCount, absences: absCount });
    } catch (err) {
      console.error(err);
      toast({ title: 'Errore', description: 'Impossibile calcolare l\'anteprima', variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const totalToDelete = (preview?.timesheets || 0) + (preview?.absences || 0);
  const selectedEmployee = useMemo(
    () => employees.find(e => e.user_id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  const handleDelete = async () => {
    if (!preview || totalToDelete === 0 || !confirmed) return;
    setLoading(true);
    try {
      const from = format(dateFrom, 'yyyy-MM-dd');
      const to = format(dateTo, 'yyyy-MM-dd');

      if (scope !== 'absences' && preview.timesheets > 0) {
        // Fetch timesheet ids
        const { data: tsRows, error: fetchErr } = await supabase
          .from('timesheets')
          .select('id')
          .eq('user_id', selectedEmployeeId)
          .gte('date', from)
          .lte('date', to);
        if (fetchErr) throw fetchErr;
        const ids = (tsRows || []).map(r => r.id);
        if (ids.length > 0) {
          // Delete sessions first (FK)
          const { error: sessErr } = await supabase
            .from('timesheet_sessions')
            .delete()
            .in('timesheet_id', ids);
          if (sessErr) throw sessErr;
          const { error: tsErr } = await supabase
            .from('timesheets')
            .delete()
            .in('id', ids);
          if (tsErr) throw tsErr;
        }
      }

      if (scope !== 'timesheets' && preview.absences > 0) {
        const { error } = await supabase
          .from('employee_absences')
          .delete()
          .eq('user_id', selectedEmployeeId)
          .gte('date', from)
          .lte('date', to);
        if (error) throw error;
      }

      toast({
        title: 'Cancellazione completata',
        description: `Eliminati ${preview.timesheets} timesheet e ${preview.absences} assenze`,
      });
      await onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Errore',
        description: `Errore durante la cancellazione: ${err instanceof Error ? err.message : 'sconosciuto'}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Cancellazione Multipla
          </DialogTitle>
          <DialogDescription>
            Elimina in blocco presenze e/o assenze di un dipendente per un intervallo di date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Dipendente</Label>
            <Select value={selectedEmployeeId} onValueChange={(v) => { setSelectedEmployeeId(v); setPreview(null); setConfirmed(false); }}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un dipendente" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.user_id} value={emp.user_id}>
                    {emp.last_name} {emp.first_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data inizio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: it }) : 'Seleziona'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => { if (d) { setDateFrom(d); setPreview(null); setConfirmed(false); } }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Data fine</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: it }) : 'Seleziona'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => { if (d) { setDateTo(d); setPreview(null); setConfirmed(false); } }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cosa cancellare</Label>
            <Select value={scope} onValueChange={(v) => { setScope(v as DeleteScope); setPreview(null); setConfirmed(false); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Presenze e assenze</SelectItem>
                <SelectItem value="timesheets">Solo presenze (timesheet)</SelectItem>
                <SelectItem value="absences">Solo assenze</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="secondary" onClick={loadPreview} disabled={!canPreview || previewLoading} className="w-full">
            {previewLoading ? 'Calcolo...' : 'Calcola anteprima'}
          </Button>

          {preview && (
            <Alert variant={totalToDelete === 0 ? 'default' : 'destructive'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Anteprima cancellazione</AlertTitle>
              <AlertDescription className="space-y-2">
                <div>
                  Dipendente: <strong>{selectedEmployee?.last_name} {selectedEmployee?.first_name}</strong>
                </div>
                <div>
                  Periodo: <strong>{format(dateFrom, 'dd/MM/yyyy')} → {format(dateTo, 'dd/MM/yyyy')}</strong>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {scope !== 'absences' && <Badge variant="outline">Timesheet: {preview.timesheets}</Badge>}
                  {scope !== 'timesheets' && <Badge variant="outline">Assenze: {preview.absences}</Badge>}
                </div>
                {totalToDelete > 0 && (
                  <div className="flex items-start space-x-2 pt-2">
                    <Checkbox id="confirm-delete" checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
                    <Label htmlFor="confirm-delete" className="cursor-pointer text-sm leading-tight">
                      Confermo di voler eliminare <strong>{totalToDelete}</strong> record. Questa azione è irreversibile.
                    </Label>
                  </div>
                )}
                {totalToDelete === 0 && (
                  <div className="text-sm">Nessun record trovato nel periodo selezionato.</div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!preview || totalToDelete === 0 || !confirmed || loading}
          >
            {loading ? 'Cancellazione...' : `Elimina ${totalToDelete} record`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
