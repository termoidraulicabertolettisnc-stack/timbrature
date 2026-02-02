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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getHolidayDates } from '@/services/ItalianHolidaysService';

interface MassTimesheetInsertDialogProps {
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

interface EmployeeTimesheetData {
  employee: Employee;
  selected: boolean;
  startTime: string;
  endTime: string;
  lunchMinutes: number;
  conflicts: { date: string }[];
  daysToInsert: Date[];
  totalDays: number;
}

export function MassTimesheetInsertDialog({ 
  open, 
  onOpenChange, 
  onSuccess,
  preSelectedEmployees = [],
  preSelectedDates
}: MassTimesheetInsertDialogProps) {
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
    date_from: new Date(),
    date_to: new Date(),
    default_start_time: '08:00',
    default_end_time: '17:00',
    default_lunch_minutes: 60,
    notes: '',
    exclude_weekends: true,
    exclude_saturdays: false,
    exclude_holidays: true,
    exclude_non_working_days: true,
  });

  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [customStartTimes, setCustomStartTimes] = useState<Map<string, string>>(new Map());
  const [customEndTimes, setCustomEndTimes] = useState<Map<string, string>>(new Map());
  const [customLunchMinutes, setCustomLunchMinutes] = useState<Map<string, number>>(new Map());
  const [showConflicts, setShowConflicts] = useState(true);
  const [companyHolidays, setCompanyHolidays] = useState<Set<string>>(new Set());
  const [employeeSettings, setEmployeeSettings] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (open) {
      loadEmployees();
      setStep('selection');
      setProgressPercent(0);
      setProcessingResults({ success: 0, errors: [] });
      setSelectedEmployees(new Set(preSelectedEmployees));
      setCustomStartTimes(new Map());
      setCustomEndTimes(new Map());
      setCustomLunchMinutes(new Map());
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
  }, [open]);

  const loadEmployees = async () => {
    try {
      const { data: employeesData, error: employeesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, company_id')
        .eq('is_active', true)
        .order('first_name');

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);
      
      if (employeesData && employeesData.length > 0) {
        const companyId = employeesData[0].company_id;
        const { data: holidaysData, error: holidaysError } = await supabase
          .from('company_holidays')
          .select('date')
          .eq('company_id', companyId);
        
        if (!holidaysError && holidaysData) {
          setCompanyHolidays(new Set(holidaysData.map(h => h.date)));
        }
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

  // Calcola le festività nazionali italiane per gli anni coinvolti
  const italianHolidays = useMemo(() => {
    const startYear = formData.date_from.getFullYear();
    const endYear = formData.date_to.getFullYear();
    const holidays = new Set<string>();
    
    for (let year = startYear; year <= endYear; year++) {
      const yearHolidays = getHolidayDates(year);
      yearHolidays.forEach(h => holidays.add(h));
    }
    
    return holidays;
  }, [formData.date_from, formData.date_to]);

  const workingDays = useMemo(() => {
    const allDays = eachDayOfInterval({
      start: formData.date_from,
      end: formData.date_to
    });

    return allDays.filter(day => {
      const dayOfWeek = getDay(day);
      
      if (formData.exclude_saturdays && dayOfWeek === 6) return false;
      if (formData.exclude_weekends && dayOfWeek === 0) return false;
      
      if (formData.exclude_holidays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        // Controlla sia festività aziendali che nazionali italiane
        if (companyHolidays.has(dateStr)) return false;
        if (italianHolidays.has(dateStr)) return false;
      }
      
      return true;
    });
  }, [formData.date_from, formData.date_to, formData.exclude_weekends, formData.exclude_saturdays, formData.exclude_holidays, companyHolidays, italianHolidays]);

  const [conflictsData, setConflictsData] = useState<Map<string, { date: string }[]>>(new Map());

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

      const { data: existingTimesheets, error } = await supabase
        .from('timesheets')
        .select('user_id, date')
        .in('user_id', employeeIds)
        .in('date', dateStrings)
        .eq('is_absence', false);

      if (error) throw error;

      const conflictsMap = new Map<string, { date: string }[]>();
      existingTimesheets?.forEach(timesheet => {
        const existing = conflictsMap.get(timesheet.user_id) || [];
        existing.push({ date: timesheet.date });
        conflictsMap.set(timesheet.user_id, existing);
      });

      setConflictsData(conflictsMap);
    } catch (error) {
      console.error('Error loading conflicts:', error);
    }
  };

  const isWorkingDayForEmployee = (userId: string, date: Date): boolean => {
    if (!formData.exclude_non_working_days) return true;
    
    const settings = employeeSettings.get(userId);
    
    if (!settings || settings.length === 0) {
      const dayOfWeek = getDay(date);
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    }
    
    const validSetting = settings.find(s => {
      const validFrom = s.valid_from ? new Date(s.valid_from) : new Date('1900-01-01');
      const validTo = s.valid_to ? new Date(s.valid_to) : new Date('2100-12-31');
      return date >= validFrom && date <= validTo;
    });
    
    if (!validSetting || !validSetting.standard_weekly_hours) {
      const dayOfWeek = getDay(date);
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    }
    
    const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    const dayOfWeek = getDay(date);
    const dayKey = dayNames[dayOfWeek];
    
    const hoursForDay = validSetting.standard_weekly_hours[dayKey];
    return hoursForDay && hoursForDay > 0;
  };

  const employeeTimesheetData: EmployeeTimesheetData[] = useMemo(() => {
    return Array.from(selectedEmployees).map(userId => {
      const employee = employees.find(e => e.user_id === userId);
      if (!employee) return null;

      const startTime = customStartTimes.get(userId) || formData.default_start_time;
      const endTime = customEndTimes.get(userId) || formData.default_end_time;
      const lunchMinutes = customLunchMinutes.get(userId) || formData.default_lunch_minutes;
      const conflicts = conflictsData.get(userId) || [];
      const conflictDates = new Set(conflicts.map(c => c.date));
      
      const daysToInsert = workingDays.filter(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (conflictDates.has(dateStr)) return false;
        return isWorkingDayForEmployee(userId, day);
      });
      
      const totalDays = daysToInsert.length;

      return {
        employee,
        selected: true,
        startTime,
        endTime,
        lunchMinutes,
        conflicts,
        daysToInsert,
        totalDays,
      };
    }).filter(Boolean) as EmployeeTimesheetData[];
  }, [selectedEmployees, employees, customStartTimes, customEndTimes, customLunchMinutes, formData, workingDays, conflictsData, employeeSettings]);

  const totalRecordsToInsert = useMemo(() => {
    return employeeTimesheetData.reduce((sum, data) => sum + data.daysToInsert.length, 0);
  }, [employeeTimesheetData]);

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
    if (employeeTimesheetData.length === 0 || totalRecordsToInsert === 0) {
      toast({
        title: "Errore",
        description: "Nessuna presenza da inserire",
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

      let processedCount = 0;
      const errors: string[] = [];

      for (const empData of employeeTimesheetData) {
        for (const day of empData.daysToInsert) {
          const dateStr = format(day, 'yyyy-MM-dd');
          const startDateTime = `${dateStr}T${empData.startTime}:00+01:00`;
          const endDateTime = `${dateStr}T${empData.endTime}:00+01:00`;

          // Inserisci timesheet
          const { data: timesheetData, error: timesheetError } = await supabase
            .from('timesheets')
            .insert({
              user_id: empData.employee.user_id,
              date: dateStr,
              notes: formData.notes || null,
              created_by: currentUser.id,
              is_absence: false,
              lunch_duration_minutes: empData.lunchMinutes
            })
            .select()
            .single();

          if (timesheetError) {
            console.error('Timesheet insert error:', timesheetError);
            errors.push(`Errore ${empData.employee.first_name} ${empData.employee.last_name} - ${dateStr}: ${timesheetError.message}`);
            continue;
          }

          // Inserisci sessione
          const { error: sessionError } = await supabase
            .from('timesheet_sessions')
            .insert({
              timesheet_id: timesheetData.id,
              session_order: 0,
              start_time: startDateTime,
              end_time: endDateTime,
              session_type: 'work',
              notes: null
            });

          if (sessionError) {
            console.error('Session insert error:', sessionError);
            errors.push(`Errore sessione ${empData.employee.first_name} ${empData.employee.last_name} - ${dateStr}: ${sessionError.message}`);
          } else {
            processedCount++;
          }

          setProgressPercent(Math.round((processedCount / totalRecordsToInsert) * 100));
        }
      }

      setProcessingResults({
        success: processedCount,
        errors
      });

      if (errors.length === 0) {
        toast({
          title: "Successo",
          description: `${processedCount} presenze inserite con successo per ${employeeTimesheetData.length} dipendenti`,
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
      console.error('Error inserting timesheets:', error);
      toast({
        title: "Errore",
        description: `Errore nell'inserimento: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderSelectionStep = () => (
    <>
      <div className="space-y-4">
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
                    {formData.date_from ? format(formData.date_from, 'dd/MM/yyyy') : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date_from}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, date_from: date }))}
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
                    {formData.date_to ? format(formData.date_to, 'dd/MM/yyyy') : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date_to}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, date_to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">3️⃣ Orari Standard</Label>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Ora Ingresso</Label>
              <Input
                type="time"
                value={formData.default_start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, default_start_time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Ora Uscita</Label>
              <Input
                type="time"
                value={formData.default_end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, default_end_time: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Pausa Pranzo (min)</Label>
              <Input
                type="number"
                value={formData.default_lunch_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, default_lunch_minutes: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">4️⃣ Opzioni</Label>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-weekends"
                checked={formData.exclude_weekends}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, exclude_weekends: !!checked }))}
              />
              <Label htmlFor="exclude-weekends" className="cursor-pointer">Escludi domeniche</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-saturdays"
                checked={formData.exclude_saturdays}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, exclude_saturdays: !!checked }))}
              />
              <Label htmlFor="exclude-saturdays" className="cursor-pointer">Escludi sabati</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-holidays"
                checked={formData.exclude_holidays}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, exclude_holidays: !!checked }))}
              />
              <Label htmlFor="exclude-holidays" className="cursor-pointer">Escludi festività aziendali</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude-non-working"
                checked={formData.exclude_non_working_days}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, exclude_non_working_days: !!checked }))}
              />
              <Label htmlFor="exclude-non-working" className="cursor-pointer">Escludi giorni non lavorativi del dipendente</Label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Note (opzionale)</Label>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Note aggiuntive..."
            rows={2}
          />
        </div>
      </div>
    </>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="bg-muted p-4 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-primary">{selectedEmployees.size}</div>
            <div className="text-sm text-muted-foreground">Dipendenti</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-primary">{workingDays.length}</div>
            <div className="text-sm text-muted-foreground">Giorni</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-primary">{totalRecordsToInsert}</div>
            <div className="text-sm text-muted-foreground">Totale Presenze</div>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-4">
          {employeeTimesheetData.map((empData) => (
            <Card key={empData.employee.user_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {empData.employee.first_name} {empData.employee.last_name}
                    </div>
                    <div className="text-sm text-muted-foreground">{empData.employee.email}</div>
                  </div>
                  <Badge variant="secondary">
                    {empData.totalDays} giorni
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Orari:</span>
                    <span className="font-medium">{empData.startTime} - {empData.endTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pausa pranzo:</span>
                    <span className="font-medium">{empData.lunchMinutes} min</span>
                  </div>
                  {empData.conflicts.length > 0 && (
                    <div className="flex items-start gap-2 text-orange-600">
                      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span>{empData.conflicts.length} giorni saltati (già presenti)</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="space-y-6 py-8">
      <div className="text-center space-y-4">
        {processingResults.success > 0 && processingResults.errors.length === 0 ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Inserimento Completato!</h3>
              <p className="text-muted-foreground">
                {processingResults.success} presenze inserite con successo
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="relative">
              <Progress value={progressPercent} className="h-4" />
              <div className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {progressPercent}%
              </div>
            </div>
            <p className="text-muted-foreground">
              Inserimento in corso... {processingResults.success} di {totalRecordsToInsert}
            </p>
          </>
        )}
      </div>

      {processingResults.errors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-destructive mb-2">Errori riscontrati:</h4>
              <ScrollArea className="h-[150px]">
                <ul className="space-y-1 text-sm">
                  {processingResults.errors.map((error, index) => (
                    <li key={index} className="text-muted-foreground">• {error}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Inserimento Presenze Multiple
          </DialogTitle>
          <DialogDescription>
            {step === 'selection' && 'Seleziona dipendenti, periodo e orari per l\'inserimento massivo di presenze'}
            {step === 'preview' && 'Verifica i dati prima di procedere con l\'inserimento'}
            {step === 'processing' && 'Inserimento in corso...'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {step === 'selection' && renderSelectionStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'processing' && renderProcessingStep()}
        </div>

        <DialogFooter>
          {step === 'selection' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={handleNextToPreview} disabled={selectedEmployees.size === 0}>
                Avanti
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleBackToSelection}>
                Indietro
              </Button>
              <Button onClick={handleSubmit} disabled={loading || totalRecordsToInsert === 0}>
                Conferma Inserimento ({totalRecordsToInsert})
              </Button>
            </>
          )}
          {step === 'processing' && processingResults.success > 0 && processingResults.errors.length === 0 && (
            <Button onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
