import React, { useState, useEffect, useMemo } from 'react';
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
import { CalendarIcon, AlertCircle, CheckCircle2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { format, addDays, eachDayOfInterval, isWeekend, getDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isHoliday as checkIsNationalHoliday } from '@/services/ItalianHolidaysService';

interface MassAbsenceInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  preSelectedEmployees?: string[];
  preSelectedDates?: { from: Date; to: Date };
}

interface Employee {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
}

interface EmployeeAbsenceData {
  employee: Employee;
  selected: boolean;
  hours: number;
  conflicts: { date: string; absence_type: string }[];
  daysToInsert: Date[];
  totalHours: number;
}

export function MassAbsenceInsertDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  preSelectedEmployees = [],
  preSelectedDates
}: MassAbsenceInsertDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [step, setStep] = useState<'selection' | 'preview' | 'processing'>('selection');
  const [progressPercent, setProgressPercent] = useState(0);
  const [processingResults, setProcessingResults] = useState<{
    success: number;
    errors: string[];
  }>({ success: 0, errors: [] });
  
  const [formData, setFormData] = useState({
    absence_type: 'F' as 'F' | 'I' | 'M' | 'PNR' | 'AI' | 'C',
    date_from: new Date(),
    date_to: new Date(),
    default_hours: 8,
    notes: '',
    exclude_weekends: true,
    exclude_saturdays: false,
    exclude_holidays: true,
    exclude_non_working_days: true,
  });

  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [customHours, setCustomHours] = useState<Map<string, number>>(new Map());
  const [showConflicts, setShowConflicts] = useState(true);
  const [companyHolidays, setCompanyHolidays] = useState<Set<string>>(new Set());
  const [employeeSettings, setEmployeeSettings] = useState<Map<string, any>>(new Map());
  const [companyCity, setCompanyCity] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      loadEmployees();
      // Reset form
      setStep('selection');
      setProgressPercent(0);
      setProcessingResults({ success: 0, errors: [] });
      setSelectedEmployees(new Set(preSelectedEmployees));
      setCustomHours(new Map());
      setSearchQuery('');
      
      if (preSelectedDates) {
        setFormData(prev => ({
          ...prev,
          date_from: preSelectedDates.from,
          date_to: preSelectedDates.to,
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          date_from: new Date(),
          date_to: new Date(),
        }));
      }
    }
  }, [open]); // Solo 'open' come dipendenza per evitare loop infiniti

  const loadEmployees = async () => {
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, company_id')
        .eq('is_active', true)
        .order('first_name');

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);
      
      // Carica i festivi aziendali e la città dell'azienda
      if (employeesData && employeesData.length > 0) {
        const companyId = employeesData[0].company_id;
        
        // Carica festivi aziendali
        const { data: holidaysData, error: holidaysError } = await supabase
          .from('company_holidays')
          .select('date')
          .eq('company_id', companyId);
        
        if (!holidaysError && holidaysData) {
          setCompanyHolidays(new Set(holidaysData.map(h => h.date)));
        }
        
        // Carica la città dell'azienda per le festività patronali
        const { data: companyData } = await supabase
          .from('companies')
          .select('city')
          .eq('id', companyId)
          .maybeSingle();
        
        setCompanyCity(companyData?.city || undefined);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dipendenti",
        variant: "destructive",
      });
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!searchQuery) return employees;
    const query = searchQuery.toLowerCase();
    return employees.filter(emp => 
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(query) ||
      emp.email.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  const workingDays = useMemo(() => {
    const allDays = eachDayOfInterval({
      start: formData.date_from,
      end: formData.date_to
    });

    return allDays.filter(day => {
      const dayOfWeek = getDay(day);
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Escludi sabato (6) se exclude_saturdays è true
      if (formData.exclude_saturdays && dayOfWeek === 6) return false;
      
      // Escludi domenica (0) se exclude_weekends è true
      if (formData.exclude_weekends && dayOfWeek === 0) return false;
      
      // Escludi festivi aziendali se exclude_holidays è true
      if (formData.exclude_holidays) {
        // Controlla festivi aziendali
        if (companyHolidays.has(dateStr)) return false;
        
        // Controlla festività nazionali e locali italiane
        if (checkIsNationalHoliday(dateStr, companyCity)) return false;
      }
      
      return true;
    });
  }, [formData.date_from, formData.date_to, formData.exclude_weekends, formData.exclude_saturdays, formData.exclude_holidays, companyHolidays, companyCity]);

  const [conflictsData, setConflictsData] = useState<Map<string, { date: string; absence_type: string }[]>>(new Map());

  useEffect(() => {
    if (step === 'preview' && selectedEmployees.size > 0) {
      loadConflicts();
      loadEmployeeSettings();
    }
  }, [step, selectedEmployees, workingDays]);
  
  const loadEmployeeSettings = async () => {
    try {
      const employeeIds = Array.from(selectedEmployees);
      
      const { data: settingsData, error } = await supabase
        .from('employee_settings')
        .select('user_id, standard_weekly_hours, valid_from, valid_to')
        .in('user_id', employeeIds)
        .order('valid_from', { ascending: false });
      
      if (error) throw error;
      
      // Crea una mappa di settings per dipendente
      const settingsMap = new Map<string, any[]>();
      settingsData?.forEach(setting => {
        const existing = settingsMap.get(setting.user_id) || [];
        existing.push(setting);
        settingsMap.set(setting.user_id, existing);
      });
      
      setEmployeeSettings(settingsMap);
    } catch (error) {
      console.error('Error loading employee settings:', error);
    }
  };

  const loadConflicts = async () => {
    try {
      const dateStrings = workingDays.map(day => format(day, 'yyyy-MM-dd'));
      const employeeIds = Array.from(selectedEmployees);

      const { data: existingAbsences, error } = await supabase
        .from('employee_absences')
        .select('user_id, date, absence_type')
        .in('user_id', employeeIds)
        .in('date', dateStrings);

      if (error) throw error;

      const conflictsMap = new Map<string, { date: string; absence_type: string }[]>();
      existingAbsences?.forEach(absence => {
        const existing = conflictsMap.get(absence.user_id) || [];
        existing.push({ date: absence.date, absence_type: absence.absence_type });
        conflictsMap.set(absence.user_id, existing);
      });

      setConflictsData(conflictsMap);
    } catch (error) {
      console.error('Error loading conflicts:', error);
    }
  };

  // Funzione helper per verificare se un dipendente lavora in un dato giorno
  const isWorkingDayForEmployee = (userId: string, date: Date): boolean => {
    if (!formData.exclude_non_working_days) return true;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const settings = employeeSettings.get(userId);
    
    if (!settings || settings.length === 0) {
      // Nessuna configurazione: assume giorni lavorativi standard (lun-ven)
      const dayOfWeek = getDay(date);
      return dayOfWeek >= 1 && dayOfWeek <= 5; // lun-ven
    }
    
    // Trova la configurazione valida per questa data
    const validSetting = settings.find(s => {
      const validFrom = s.valid_from ? new Date(s.valid_from) : new Date('1900-01-01');
      const validTo = s.valid_to ? new Date(s.valid_to) : new Date('2100-12-31');
      return date >= validFrom && date <= validTo;
    });
    
    if (!validSetting || !validSetting.standard_weekly_hours) {
      // Nessuna configurazione valida: assume giorni standard
      const dayOfWeek = getDay(date);
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    }
    
    // Mappa giorno settimana a chiave italiana
    const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    const dayOfWeek = getDay(date);
    const dayKey = dayNames[dayOfWeek];
    
    const hoursForDay = validSetting.standard_weekly_hours[dayKey];
    return hoursForDay && hoursForDay > 0;
  };

  const employeeAbsenceData: EmployeeAbsenceData[] = useMemo(() => {
    return Array.from(selectedEmployees).map(userId => {
      const employee = employees.find(e => e.user_id === userId);
      if (!employee) return null;

      const hours = customHours.get(userId) || formData.default_hours;
      const conflicts = conflictsData.get(userId) || [];
      const conflictDates = new Set(conflicts.map(c => c.date));
      
      // Filtra i giorni lavorativi specifici per questo dipendente
      const daysToInsert = workingDays.filter(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (conflictDates.has(dateStr)) return false;
        return isWorkingDayForEmployee(userId, day);
      });
      
      const totalHours = daysToInsert.length * hours;

      return {
        employee,
        selected: true,
        hours,
        conflicts,
        daysToInsert,
        totalHours,
      };
    }).filter(Boolean) as EmployeeAbsenceData[];
  }, [selectedEmployees, employees, customHours, formData.default_hours, workingDays, conflictsData, employeeSettings, formData.exclude_non_working_days]);

  const totalRecordsToInsert = useMemo(() => {
    return employeeAbsenceData.reduce((sum, data) => sum + data.daysToInsert.length, 0);
  }, [employeeAbsenceData]);

  const handleSelectAll = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map(e => e.user_id)));
    }
  };

  const handleToggleEmployee = (userId: string) => {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedEmployees(newSelected);
  };

  const handleNextToPreview = () => {
    if (selectedEmployees.size === 0) {
      toast({
        title: "Errore",
        description: "Seleziona almeno un dipendente",
        variant: "destructive",
      });
      return;
    }
    setStep('preview');
  };

  const handleBackToSelection = () => {
    setStep('selection');
  };

  const handleSubmit = async () => {
    if (employeeAbsenceData.length === 0 || totalRecordsToInsert === 0) {
      toast({
        title: "Errore",
        description: "Nessuna assenza da inserire",
        variant: "destructive",
      });
      return;
    }

    setStep('processing');
    setLoading(true);
    setProgressPercent(0);

    try {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!currentUser) throw new Error('Utente non autenticato');

      const allAbsences: any[] = [];
      let processedCount = 0;
      const errors: string[] = [];

      for (const empData of employeeAbsenceData) {
        for (const day of empData.daysToInsert) {
          allAbsences.push({
            user_id: empData.employee.user_id,
            company_id: empData.employee.company_id,
            date: format(day, 'yyyy-MM-dd'),
            absence_type: formData.absence_type,
            hours: empData.hours,
            notes: formData.notes || null,
            created_by: currentUser.id
          });
        }
      }

      // Inserimento batch (max 1000 record per volta per limiti Supabase)
      const batchSize = 1000;
      for (let i = 0; i < allAbsences.length; i += batchSize) {
        const batch = allAbsences.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from('employee_absences')
          .insert(batch);

        if (error) {
          console.error('Batch insert error:', error);
          errors.push(`Errore batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          processedCount += batch.length;
        }

        setProgressPercent(Math.round((i + batch.length) / allAbsences.length * 100));
      }

      setProcessingResults({
        success: processedCount,
        errors
      });

      if (errors.length === 0) {
        toast({
          title: "Successo",
          description: `${processedCount} assenze inserite con successo per ${employeeAbsenceData.length} dipendenti`,
        });
        onSuccess();
        setTimeout(() => onOpenChange(false), 2000);
      } else {
        toast({
          title: "Completato con errori",
          description: `${processedCount} inserite, ${errors.length} errori`,
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Error inserting absences:', error);
      toast({
        title: "Errore",
        description: `Errore nell'inserimento: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
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
      'PNR': 'Permesso non retribuito',
      'AI': 'Assenza ingiustificata',
      'C': 'Congedo'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const renderSelectionStep = () => (
    <>
      <div className="space-y-4">
        {/* Selezione dipendenti */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">1️⃣ Seleziona Dipendenti</Label>
            <Badge variant="secondary">
              {selectedEmployees.size} selezionati
            </Badge>
          </div>
          
          <Input
            placeholder="🔍 Cerca dipendente per nome o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-2"
          />

          <div className="flex items-center space-x-2 mb-2">
            <Checkbox
              id="select-all"
              checked={selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <Label htmlFor="select-all" className="cursor-pointer">
              Seleziona tutti ({filteredEmployees.length})
            </Label>
          </div>

          <ScrollArea className="h-[200px] border rounded-md p-2">
            <div className="space-y-2">
              {filteredEmployees.map((employee) => (
                <div key={employee.user_id} className="flex items-center space-x-2 p-2 hover:bg-accent rounded">
                  <Checkbox
                    id={employee.user_id}
                    checked={selectedEmployees.has(employee.user_id)}
                    onCheckedChange={() => handleToggleEmployee(employee.user_id)}
                  />
                  <Label htmlFor={employee.user_id} className="flex-1 cursor-pointer">
                    <div className="font-medium">{employee.first_name} {employee.last_name}</div>
                    <div className="text-sm text-muted-foreground">{employee.email}</div>
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Periodo */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">2️⃣ Periodo</Label>
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-weekends"
                checked={formData.exclude_weekends}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, exclude_weekends: checked as boolean }))
                }
              />
              <Label htmlFor="exclude-weekends" className="cursor-pointer">
                Escludi domeniche
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-saturdays"
                checked={formData.exclude_saturdays}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, exclude_saturdays: checked as boolean }))
                }
              />
              <Label htmlFor="exclude-saturdays" className="cursor-pointer">
                Escludi sabati
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-holidays"
                checked={formData.exclude_holidays}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, exclude_holidays: checked as boolean }))
                }
              />
              <Label htmlFor="exclude-holidays" className="cursor-pointer">
                Escludi festivi aziendali ({companyHolidays.size})
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-non-working-days"
                checked={formData.exclude_non_working_days}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ ...prev, exclude_non_working_days: checked as boolean }))
                }
              />
              <Label htmlFor="exclude-non-working-days" className="cursor-pointer">
                Escludi giorni non lavorativi per contratto
              </Label>
            </div>
          </div>

          <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
            <div><strong>Giorni nel periodo:</strong> {eachDayOfInterval({ start: formData.date_from, end: formData.date_to }).length}</div>
            <div><strong>Giorni lavorativi (base):</strong> {workingDays.length}</div>
            <div className="text-xs text-muted-foreground">
              {formData.exclude_holidays && `• Esclusi ${companyHolidays.size} festivi aziendali`}
              {formData.exclude_non_working_days && ` • Verranno esclusi i giorni non lavorativi per contratto di ogni dipendente`}
            </div>
          </div>
        </div>

        {/* Tipo assenza */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">3️⃣ Tipo Assenza</Label>
          <Select 
            value={formData.absence_type} 
            onValueChange={(value: any) => setFormData(prev => ({ ...prev, absence_type: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
              <SelectContent>
                <SelectItem value="F">Ferie/Permesso</SelectItem>
                <SelectItem value="M">Malattia</SelectItem>
                <SelectItem value="I">Infortunio</SelectItem>
                <SelectItem value="PNR">Permesso non retribuito</SelectItem>
                <SelectItem value="AI">Assenza ingiustificata</SelectItem>
                <SelectItem value="C">Congedo</SelectItem>
              </SelectContent>
          </Select>

          <div className="space-y-2">
            <Label htmlFor="default_hours">Ore per Giorno (default)</Label>
            <Input
              id="default_hours"
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={formData.default_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, default_hours: parseFloat(e.target.value) || 0 }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              placeholder="Note condivise per tutte le assenze..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Annulla
        </Button>
        <Button type="button" onClick={handleNextToPreview} disabled={selectedEmployees.size === 0}>
          Avanti: Riepilogo →
        </Button>
      </DialogFooter>
    </>
  );

  const renderPreviewStep = () => (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">4️⃣ Riepilogo e Verifica</Label>
          <Badge variant={totalRecordsToInsert > 0 ? "default" : "destructive"}>
            {totalRecordsToInsert} record da inserire
          </Badge>
        </div>

        <div className="p-4 bg-muted rounded-lg space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Tipo:</strong> {getAbsenceTypeLabel(formData.absence_type)}
            </div>
            <div>
              <strong>Periodo:</strong> {format(formData.date_from, 'dd/MM/yyyy')} - {format(formData.date_to, 'dd/MM/yyyy')}
            </div>
            <div>
              <strong>Dipendenti:</strong> {employeeAbsenceData.length}
            </div>
            <div>
              <strong>Giorni lavorativi:</strong> {workingDays.length}
            </div>
          </div>
        </div>

        <ScrollArea className="h-[300px] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dipendente</TableHead>
                <TableHead className="text-center">Giorni</TableHead>
                <TableHead className="text-center">Ore/g</TableHead>
                <TableHead className="text-center">Tot. Ore</TableHead>
                <TableHead className="text-center">Conflitti</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeAbsenceData.map((data) => (
                <TableRow key={data.employee.user_id}>
                  <TableCell>
                    <div className="font-medium">{data.employee.first_name} {data.employee.last_name}</div>
                  </TableCell>
                  <TableCell className="text-center">{data.daysToInsert.length}</TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={data.hours}
                      onChange={(e) => {
                        const newHours = parseFloat(e.target.value) || 0;
                        setCustomHours(prev => new Map(prev).set(data.employee.user_id, newHours));
                      }}
                      className="w-16 h-8 text-center"
                    />
                  </TableCell>
                  <TableCell className="text-center font-medium">{data.totalHours.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    {data.conflicts.length > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        ⚠️ {data.conflicts.length}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        ✓
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        {employeeAbsenceData.some(d => d.conflicts.length > 0) && (
          <Collapsible open={showConflicts} onOpenChange={setShowConflicts}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between" size="sm">
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Dettagli conflitti
                </span>
                {showConflicts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 p-3 border rounded-md bg-destructive/5">
              <div className="space-y-2 text-sm">
                {employeeAbsenceData
                  .filter(d => d.conflicts.length > 0)
                  .map((data) => (
                    <div key={data.employee.user_id}>
                      <strong>{data.employee.first_name} {data.employee.last_name}:</strong>
                      <div className="ml-4 text-muted-foreground">
                        {data.conflicts.map((c, idx) => (
                          <div key={idx}>
                            • {format(parseISO(c.date), 'dd/MM/yyyy')}: {getAbsenceTypeLabel(c.absence_type)}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                ℹ️ I giorni con conflitti saranno automaticamente esclusi dall'inserimento
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={handleBackToSelection}>
          ← Indietro
        </Button>
        <Button 
          type="button" 
          onClick={handleSubmit} 
          disabled={totalRecordsToInsert === 0}
        >
          Inserisci Tutto ({totalRecordsToInsert})
        </Button>
      </DialogFooter>
    </>
  );

  const renderProcessingStep = () => (
    <div className="space-y-4 py-4">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">
          {loading ? 'Inserimento in corso...' : 'Completato!'}
        </div>
        <Progress value={progressPercent} className="w-full" />
        <div className="text-sm text-muted-foreground">
          {progressPercent}%
        </div>
      </div>

      {!loading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{processingResults.success} assenze inserite</span>
          </div>
          
          {processingResults.errors.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">{processingResults.errors.length} errori</span>
              </div>
              <ScrollArea className="h-[100px] border rounded p-2 text-sm">
                {processingResults.errors.map((err, idx) => (
                  <div key={idx} className="text-destructive">{err}</div>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      {!loading && (
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Inserimento Assenze Multiplo
          </DialogTitle>
          <DialogDescription>
            Inserisci assenze per più dipendenti contemporaneamente in un periodo specifico
          </DialogDescription>
        </DialogHeader>

        {step === 'selection' && renderSelectionStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'processing' && renderProcessingStep()}
      </DialogContent>
    </Dialog>
  );
}

function parseISO(dateString: string): Date {
  return new Date(dateString);
}
