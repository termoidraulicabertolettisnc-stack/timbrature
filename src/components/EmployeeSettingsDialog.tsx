import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { AlertTriangle, Save, RotateCcw, CalendarIcon, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { saveTemporalEmployeeSettings, recalculateTimesheetsFromDate } from '@/utils/temporalEmployeeSettings';

interface EmployeeSettings {
  id?: string;
  user_id: string;
  company_id: string;
  standard_weekly_hours: any;
  lunch_break_type: string | null;
  saturday_handling: string | null;
  meal_voucher_policy: string | null;
  night_shift_start: string | null;
  night_shift_end: string | null;
  overtime_monthly_compensation?: boolean | null;
  business_trip_rate_with_meal: number | null;
  business_trip_rate_without_meal: number | null;
  saturday_hourly_rate: number | null;
  meal_voucher_amount: number | null;
  daily_allowance_amount: number | null;
  daily_allowance_policy: string | null;
  daily_allowance_min_hours: number | null;
  lunch_break_min_hours: number | null;
  // Entry tolerance fields
  enable_entry_tolerance?: boolean | null;
  standard_start_time?: string | null;
  entry_tolerance_minutes?: number | null;
  // Overtime conversion fields
  enable_overtime_conversion?: boolean | null;
  overtime_conversion_rate?: number | null;
}

interface CompanySettings {
  standard_weekly_hours: any;
  lunch_break_type: '0_minuti' | '15_minuti' | '30_minuti' | '45_minuti' | '60_minuti' | '90_minuti' | '120_minuti' | 'libera';
  saturday_handling: 'trasferta' | 'straordinario';
  meal_voucher_policy: 'oltre_6_ore' | 'sempre_parttime' | 'conteggio_giorni' | 'disabilitato';
  night_shift_start: string;
  night_shift_end: string;
  business_trip_rate_with_meal: number;
  business_trip_rate_without_meal: number;
  saturday_hourly_rate: number;
  meal_voucher_amount: number;
  daily_allowance_amount: number;
  daily_allowance_policy: string;
  daily_allowance_min_hours: number;
  lunch_break_min_hours: number;
  // Entry tolerance fields
  enable_entry_tolerance?: boolean;
  standard_start_time?: string;
  entry_tolerance_minutes?: number;
  // Overtime conversion fields
  enable_overtime_conversion?: boolean;
  default_overtime_conversion_rate?: number;
}

interface EmployeeSettingsDialogProps {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    company_id: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeUpdate?: () => void;
}

export const EmployeeSettingsDialog = ({ employee, open, onOpenChange, onEmployeeUpdate }: EmployeeSettingsDialogProps) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<EmployeeSettings>({
    user_id: employee.id,
    company_id: employee.company_id,
    standard_weekly_hours: null,
    lunch_break_type: null,
    saturday_handling: null,
    meal_voucher_policy: null,
    night_shift_start: null,
    night_shift_end: null,
    overtime_monthly_compensation: null,
    business_trip_rate_with_meal: null,
    business_trip_rate_without_meal: null,
    saturday_hourly_rate: null,
    meal_voucher_amount: null,
    daily_allowance_amount: null,
    daily_allowance_policy: null,
    daily_allowance_min_hours: null,
    lunch_break_min_hours: null,
    // Entry tolerance fields
    enable_entry_tolerance: null,
    standard_start_time: null,
    entry_tolerance_minutes: null,
    // Overtime conversion fields
    enable_overtime_conversion: null,
    overtime_conversion_rate: null,
  });
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companies, setCompanies] = useState<Array<{id: string, name: string}>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(employee.company_id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Temporal settings state
  const [applicationType, setApplicationType] = useState<'from_today' | 'from_date' | 'retroactive'>('from_today');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open, employee.id, selectedCompanyId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Load all companies for selection
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');

      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);
      
      // Load company settings (defaults) for current company
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', selectedCompanyId)
        .maybeSingle();

      if (companyError) throw companyError;
      setCompanySettings(companyData);

      // Load employee specific settings (only active record)
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .eq('user_id', employee.id)
        .eq('company_id', selectedCompanyId)
        .is('valid_to', null)  // Only get active settings
        .maybeSingle();

      if (employeeError) throw employeeError;

      if (employeeData) {
        setSettings(employeeData);
      } else {
        // Reset to default (null values will use company defaults)
        setSettings({
          user_id: employee.id,
          company_id: selectedCompanyId,
          standard_weekly_hours: null,
          lunch_break_type: null,
          saturday_handling: null,
          meal_voucher_policy: null,
          night_shift_start: null,
          night_shift_end: null,
          overtime_monthly_compensation: null,
          business_trip_rate_with_meal: null,
          business_trip_rate_without_meal: null,
          saturday_hourly_rate: null,
          meal_voucher_amount: null,
          daily_allowance_amount: null,
          daily_allowance_policy: null,
          daily_allowance_min_hours: null,
          lunch_break_min_hours: null,
          // Entry tolerance fields
          enable_entry_tolerance: null,
          standard_start_time: null,
          entry_tolerance_minutes: null,
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Errore nel caricamento delle impostazioni');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      
      // STEP 1: Ensure we have a valid session before starting
      console.log('🔐 Ensuring valid authentication session...');
      const { data: sessionCheck } = await supabase.auth.getSession();
      if (!sessionCheck.session) {
        toast.error('Sessione scaduta. Ricarica la pagina e riprova.');
        return;
      }

      // First update the employee's company assignment
      console.log('🏢 Updating company assignment...');
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ company_id: selectedCompanyId })
        .eq('user_id', employee.id);

      if (profileError) throw profileError;
      console.log('✅ Company assignment updated');

      // Prepare settings data (excluding system fields)
      const {
        id,
        user_id,
        company_id,
        ...settingsData
      } = settings;

      // Get from date for temporal save
      let fromDate: string | undefined;
      if (applicationType === 'from_date' && selectedDate) {
        fromDate = selectedDate.toISOString().split('T')[0];
      }

      console.log('💾 Saving employee settings...');
      // Save using temporal logic
      const result = await saveTemporalEmployeeSettings(
        employee.id,
        selectedCompanyId,
        settingsData,
        applicationType,
        fromDate
      );

      if (!result.success) {
        throw new Error(result.error || 'Errore nel salvataggio');
      }
      
      console.log('✅ All operations completed successfully');

      // If retroactive change, trigger recalculation
      if (applicationType === 'retroactive') {
        const recalcResult = await recalculateTimesheetsFromDate(employee.id, '1900-01-01');
        if (!recalcResult.success) {
          console.warn('Warning: Failed to recalculate timesheets:', recalcResult.error);
          toast.success('Impostazioni salvate con successo. Avviso: alcuni calcoli potrebbero richiedere un aggiornamento manuale.');
        } else {
          toast.success('Impostazioni salvate con successo e calcoli aggiornati retroattivamente.');
        }
      } else if (applicationType === 'from_date' && fromDate) {
        // For date-specific changes, recalculate from that date
        const recalcResult = await recalculateTimesheetsFromDate(employee.id, fromDate);
        if (!recalcResult.success) {
          console.warn('Warning: Failed to recalculate timesheets:', recalcResult.error);
        }
        toast.success('Impostazioni salvate con successo. Le modifiche si applicano dal ' + format(selectedDate!, 'dd/MM/yyyy', { locale: it }));
      } else {
        toast.success('Impostazioni salvate con successo. Le modifiche si applicano da oggi.');
      }

      setHasChanges(false);
      onEmployeeUpdate?.(); // Refresh the parent component
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni: ' + (error instanceof Error ? error.message : 'Errore sconosciuto'));
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof EmployeeSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    setSettings({
      user_id: employee.id,
      company_id: selectedCompanyId,
      standard_weekly_hours: null,
      lunch_break_type: null,
      saturday_handling: null,
      meal_voucher_policy: null,
      night_shift_start: null,
      night_shift_end: null,
      overtime_monthly_compensation: null,
      business_trip_rate_with_meal: null,
      business_trip_rate_without_meal: null,
      saturday_hourly_rate: null,
      meal_voucher_amount: null,
      daily_allowance_amount: null,
      daily_allowance_policy: null,
      daily_allowance_min_hours: null,
      lunch_break_min_hours: null,
      // Entry tolerance fields  
      enable_entry_tolerance: null,
      standard_start_time: null,
      entry_tolerance_minutes: null,
    });
    setHasChanges(true);
  };

  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setHasChanges(true);
  };

  const getEffectiveValue = (employeeValue: any, companyValue: any) => {
    return employeeValue !== null ? employeeValue : companyValue;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Caricamento impostazioni...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Impostazioni per {employee.first_name} {employee.last_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configura impostazioni specifiche per questo dipendente. I valori non impostati useranno le impostazioni aziendali.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {hasChanges && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ci sono modifiche non salvate. Ricordati di salvare prima di chiudere.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={resetToDefaults} className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Ripristina Valori Azienda
            </Button>
          </div>
          
          {/* Company Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Azienda di Appartenenza</CardTitle>
              <CardDescription>
                Seleziona l'azienda per questo dipendente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Azienda</Label>
                  <Select
                    value={selectedCompanyId}
                    onValueChange={handleCompanyChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona azienda" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Work Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Orario di Lavoro Settimanale</CardTitle>
              <CardDescription>
                Ore di lavoro standard per ogni giorno della settimana
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                {['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((day) => {
                  const dayNames: { [key: string]: string } = {
                    lun: 'Lunedì',
                    mar: 'Martedì', 
                    mer: 'Mercoledì',
                    gio: 'Giovedì',
                    ven: 'Venerdì',
                    sab: 'Sabato',
                    dom: 'Domenica'
                  };
                  
                  const currentValue = settings.standard_weekly_hours?.[day] || '';
                  const companyValue = companySettings?.standard_weekly_hours?.[day] || 0;
                  const effectiveValue = currentValue || companyValue;
                  
                  return (
                    <div key={day} className="space-y-2">
                      <Label htmlFor={`hours-${day}`} className="text-sm font-medium">
                        {dayNames[day]}
                      </Label>
                      <Input
                        id={`hours-${day}`}
                        type="number"
                        min="0"
                        max="12"
                        step="0.5"
                        value={currentValue}
                        onChange={(e) => {
                          const newHours = settings.standard_weekly_hours ? { ...settings.standard_weekly_hours } : {};
                          newHours[day] = e.target.value ? parseFloat(e.target.value) : 0;
                          updateSetting('standard_weekly_hours', newHours);
                        }}
                        placeholder={companyValue.toString()}
                        className="text-center"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        Effettivo: {effectiveValue}h
                      </p>
                    </div>
                  );
                })}
              </div>
              {companySettings && companySettings.standard_weekly_hours && (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Valori aziendali:</strong> {
                      Object.entries(companySettings.standard_weekly_hours)
                        .map(([day, hours]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours}h`)
                        .join(', ')
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lunch Break */}
          <Card>
            <CardHeader>
              <CardTitle>Pausa Pranzo</CardTitle>
              <CardDescription>
                Configurazione della pausa pranzo
                {companySettings && ` (Aziendale: ${companySettings.lunch_break_type})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Tipo Pausa Pranzo</Label>
                  <Select
                    value={settings.lunch_break_type || 'company_default'}
                    onValueChange={(value) => updateSetting('lunch_break_type', value === 'company_default' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={companySettings ? `Default: ${companySettings.lunch_break_type}` : 'Seleziona tipo'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                      <SelectItem value="libera">Libera</SelectItem>
                      <SelectItem value="30_minuti">30 minuti fissi</SelectItem>
                      <SelectItem value="60_minuti">60 minuti fissi</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.lunch_break_type, companySettings?.lunch_break_type)}
                  </p>
                </div>
                
                <div>
                  <Label>Ore Minime per Applicare Pausa Pranzo</Label>
                  <Input
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={settings.lunch_break_min_hours || ''}
                    onChange={(e) => updateSetting('lunch_break_min_hours', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder={companySettings?.lunch_break_min_hours?.toString() || '6'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.lunch_break_min_hours, companySettings?.lunch_break_min_hours || 6)} ore
                  </p>
                  <p className="text-xs text-muted-foreground">
                    La pausa pranzo viene applicata automaticamente solo se il turno supera questo numero di ore
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overtime Monthly Compensation */}
          <Card>
            <CardHeader>
              <CardTitle>Compenso Straordinari</CardTitle>
              <CardDescription>
                Gli straordinari vengono calcolati sempre dopo le ore lavorative standard giornaliere
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <input
                  id="overtime_monthly_compensation"
                  type="checkbox"
                  checked={settings.overtime_monthly_compensation || false}
                  onChange={(e) => updateSetting('overtime_monthly_compensation', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="overtime_monthly_compensation">Compenso Mensile Straordinari</Label>
              </div>
            </CardContent>
          </Card>

          {/* Saturday Handling */}
          <Card>
            <CardHeader>
              <CardTitle>Gestione Sabato</CardTitle>
              <CardDescription>
                Come vengono gestite le ore del sabato
                {companySettings && ` (Aziendale: ${companySettings.saturday_handling})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Gestione Sabato</Label>
                  <Select
                    value={settings.saturday_handling || 'company_default'}
                    onValueChange={(value) => updateSetting('saturday_handling', value === 'company_default' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={companySettings ? `Default: ${companySettings.saturday_handling}` : 'Seleziona gestione'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                      <SelectItem value="trasferta">Trasferta</SelectItem>
                      <SelectItem value="straordinario">Straordinario</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.saturday_handling, companySettings?.saturday_handling)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Meal Vouchers and Daily Allowance - Unified Policy */}
          <Card>
            <CardHeader>
              <CardTitle>Buoni Pasto e Indennità Giornaliera</CardTitle>
              <CardDescription>
                Politica unificata per buoni pasto o indennità giornaliera (mutuamente esclusivi)
                {companySettings && ` (Aziendale: ${(companySettings as any).meal_allowance_policy || 'disabled'})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Politica Buoni Pasto / Indennità</Label>
                  <Select
                    value={(settings as any).meal_allowance_policy || 'company_default'}
                    onValueChange={(value) => updateSetting('meal_allowance_policy' as any, value === 'company_default' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={companySettings ? `Default: ${(companySettings as any).meal_allowance_policy || 'disabled'}` : 'Seleziona politica'} />
                    </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                       <SelectItem value="disabled">Tutto disabilitato</SelectItem>
                       <SelectItem value="meal_vouchers_only">Solo buoni pasto</SelectItem>
                       <SelectItem value="daily_allowance">Indennità giornaliera</SelectItem>
                       <SelectItem value="both">Buoni pasto e indennità</SelectItem>
                     </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue((settings as any).meal_allowance_policy, (companySettings as any)?.meal_allowance_policy || 'disabled')}
                  </p>
                </div>

                 {/* Conditional Fields for Daily Allowance */}
                 {((settings as any).meal_allowance_policy === 'daily_allowance' || (settings as any).meal_allowance_policy === 'both' || (!(settings as any).meal_allowance_policy && ((companySettings as any)?.meal_allowance_policy === 'daily_allowance' || (companySettings as any)?.meal_allowance_policy === 'both'))) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                    <div>
                      <Label htmlFor="daily_allowance_amount">
                        Importo indennità giornaliera (€)
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="daily_allowance_amount"
                        type="number"
                        step="0.01"
                        value={settings.daily_allowance_amount || ''}
                        onChange={(e) => updateSetting('daily_allowance_amount', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder={`Default: €${(companySettings as any)?.default_daily_allowance_amount || 10.00}`}
                        className="mt-1"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Valore effettivo: €{settings.daily_allowance_amount || (companySettings as any)?.default_daily_allowance_amount || 10.00}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="daily_allowance_min_hours">
                        Ore minime per indennità
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="daily_allowance_min_hours"
                        type="number"
                        min="1"
                        value={settings.daily_allowance_min_hours || ''}
                        onChange={(e) => updateSetting('daily_allowance_min_hours', e.target.value ? parseInt(e.target.value) : null)}
                        placeholder={`Default: ${(companySettings as any)?.default_daily_allowance_min_hours || 6}`}
                        className="mt-1"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Valore effettivo: {settings.daily_allowance_min_hours || (companySettings as any)?.default_daily_allowance_min_hours || 6} ore
                      </p>
                    </div>
                  </div>
                )}

                 {/* Conditional Fields for Meal Vouchers */}
                 {((settings as any).meal_allowance_policy === 'meal_vouchers_only' || (settings as any).meal_allowance_policy === 'both' || 
                   (!(settings as any).meal_allowance_policy && ((companySettings as any)?.meal_allowance_policy === 'meal_vouchers_only' || (companySettings as any)?.meal_allowance_policy === 'both'))) && (
                  <div className="p-4 border rounded-lg bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="meal_voucher_amount">
                          Importo buono pasto (€)
                        </Label>
                        <Input
                          id="meal_voucher_amount"
                          type="number"
                          step="0.01"
                          value={settings.meal_voucher_amount || ''}
                          onChange={(e) => updateSetting('meal_voucher_amount', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder={`Default: €${companySettings?.meal_voucher_amount || 8.00}`}
                          className="mt-1"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Valore effettivo: €{settings.meal_voucher_amount || companySettings?.meal_voucher_amount || 8.00}
                        </p>
                      </div>
                      
                       {/* Meal Voucher Minimum Hours - Only for meal_vouchers_only policy */}
                       {((settings as any).meal_allowance_policy === 'meal_vouchers_only' || (settings as any).meal_allowance_policy === 'both' || 
                         (!(settings as any).meal_allowance_policy && ((companySettings as any)?.meal_allowance_policy === 'meal_vouchers_only' || (companySettings as any)?.meal_allowance_policy === 'both'))) && (
                        <div>
                          <Label htmlFor="meal_voucher_min_hours">
                            Ore minime per buoni pasto
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="24"
                            value={String((settings as any).meal_voucher_min_hours || (companySettings as any)?.meal_voucher_min_hours || 6)}
                            onChange={(e) => updateSetting('meal_voucher_min_hours' as any, parseInt(e.target.value) || 6)}
                            className="mt-1"
                            placeholder="6"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Valore effettivo: {(settings as any).meal_voucher_min_hours || (companySettings as any)?.meal_voucher_min_hours || 6} ore
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Overtime Compensation */}
          <Card>
            <CardHeader>
              <CardTitle>Compensazione Straordinari Mensile</CardTitle>
              <CardDescription>
                Se abilitato, gli straordinari vengono compensati mensilmente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Compensazione Mensile</Label>
                  <Select
                    value={settings.overtime_monthly_compensation === null ? 'company_default' : settings.overtime_monthly_compensation ? 'enabled' : 'disabled'}
                    onValueChange={(value) => updateSetting('overtime_monthly_compensation', 
                      value === 'company_default' ? null : 
                      value === 'enabled' ? true : false
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona opzione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                      <SelectItem value="enabled">Abilitato</SelectItem>
                      <SelectItem value="disabled">Disabilitato</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {settings.overtime_monthly_compensation === null ? 'Default Aziendale' : settings.overtime_monthly_compensation ? 'Abilitato' : 'Disabilitato'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Night Shift */}
          <Card>
            <CardHeader>
              <CardTitle>Turno Notturno</CardTitle>
              <CardDescription>
                Orari per il calcolo del lavoro notturno
                {companySettings && ` (Aziendale: ${companySettings.night_shift_start} - ${companySettings.night_shift_end})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="night-start">Inizio Turno Notturno</Label>
                  <Input
                    id="night-start"
                    type="time"
                    value={settings.night_shift_start || ''}
                    onChange={(e) => updateSetting('night_shift_start', e.target.value || null)}
                    placeholder={companySettings ? `Default: ${companySettings.night_shift_start}` : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.night_shift_start, companySettings?.night_shift_start)}
                  </p>
                </div>
                <div>
                  <Label htmlFor="night-end">Fine Turno Notturno</Label>
                  <Input
                    id="night-end"
                    type="time"
                    value={settings.night_shift_end || ''}
                    onChange={(e) => updateSetting('night_shift_end', e.target.value || null)}
                    placeholder={companySettings ? `Default: ${companySettings.night_shift_end}` : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.night_shift_end, companySettings?.night_shift_end)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Saturday Hourly Rate - Show when Saturday is handled as business trip OR overtime */}
          {((getEffectiveValue(settings.saturday_handling, companySettings?.saturday_handling)) === 'trasferta' || 
            (getEffectiveValue(settings.saturday_handling, companySettings?.saturday_handling)) === 'straordinario') && (
            <Card>
              <CardHeader>
                <CardTitle>Tariffa Oraria Sabato</CardTitle>
                <CardDescription>
                  Tariffa oraria personalizzata per le ore lavorate nei sabati 
                  {companySettings && ` (Aziendale: €${companySettings.saturday_hourly_rate}/ora)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="saturday-hourly-rate">Tariffa Oraria Sabato (€/ora)</Label>
                    <Input
                      id="saturday-hourly-rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings.saturday_hourly_rate || ''}
                      onChange={(e) => updateSetting('saturday_hourly_rate', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder={companySettings ? `Default: €${companySettings.saturday_hourly_rate}/ora` : '€10.00/ora'}
                    />
                    <p className="text-xs text-muted-foreground">
                      Valore effettivo: €{getEffectiveValue(settings.saturday_hourly_rate, companySettings?.saturday_hourly_rate)}/ora
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Info:</strong> Questa tariffa viene applicata solo quando i sabati sono configurati come "Trasferte". Per i sabati configurati come "Straordinari" si applica la normale tariffa straordinaria.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        {/* Entry Tolerance System */}
        <Card>
          <CardHeader>
            <CardTitle>Sistema di Tolleranza Orario</CardTitle>
            <CardDescription>
              Configurazione personalizzata per la tolleranza orario ingresso
              {companySettings && (
                <span> (Aziendale: {companySettings.enable_entry_tolerance ? 'Abilitato' : 'Disabilitato'}
                {companySettings.enable_entry_tolerance && ` - ${companySettings.standard_start_time} ±${companySettings.entry_tolerance_minutes}min`})</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Sistema di Tolleranza</Label>
                <Select
                  value={settings.enable_entry_tolerance === null ? 'company_default' : (settings.enable_entry_tolerance ? 'enabled' : 'disabled')}
                  onValueChange={(value) => {
                    if (value === 'company_default') {
                      updateSetting('enable_entry_tolerance', null);
                    } else {
                      updateSetting('enable_entry_tolerance', value === 'enabled');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={companySettings ? `Default: ${companySettings.enable_entry_tolerance ? 'Abilitato' : 'Disabilitato'}` : 'Seleziona'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                    <SelectItem value="enabled">Abilitato per questo dipendente</SelectItem>
                    <SelectItem value="disabled">Disabilitato per questo dipendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show custom fields only if enabled for this employee or using company default with tolerance enabled */}
              {(settings.enable_entry_tolerance === true || 
                (settings.enable_entry_tolerance === null && companySettings?.enable_entry_tolerance)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                  <div>
                    <Label htmlFor="emp_standard_start_time">
                      Orario Standard Personalizzato (HH:MM)
                    </Label>
                    <Input
                      id="emp_standard_start_time"
                      type="time"
                      value={settings.standard_start_time || ''}
                      onChange={(e) => updateSetting('standard_start_time', e.target.value || null)}
                      placeholder={companySettings?.standard_start_time || '08:00'}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Effettivo: {getEffectiveValue(settings.standard_start_time, companySettings?.standard_start_time) || '08:00'}
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="emp_entry_tolerance_minutes">
                      Tolleranza Personalizzata (Minuti)
                    </Label>
                    <Input
                      id="emp_entry_tolerance_minutes"
                      type="number"
                      min="0"
                      max="60"
                      step="1"
                      value={settings.entry_tolerance_minutes || ''}
                      onChange={(e) => updateSetting('entry_tolerance_minutes', parseInt(e.target.value) || null)}
                      placeholder={companySettings?.entry_tolerance_minutes?.toString() || '10'}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Effettivo: ±{getEffectiveValue(settings.entry_tolerance_minutes, companySettings?.entry_tolerance_minutes) || 10} minuti
                    </p>
                  </div>
                  
                  <div className="col-span-full">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        <strong>Funzionamento:</strong> Solo gli orari di ingresso IN ANTICIPO entro la tolleranza verranno normalizzati all'orario standard nelle dashboard.
                        <br />
                        <strong>Esempio:</strong> Orario {getEffectiveValue(settings.standard_start_time, companySettings?.standard_start_time) || '08:00'}, tolleranza {getEffectiveValue(settings.entry_tolerance_minutes, companySettings?.entry_tolerance_minutes) || 10} min prima
                        <br />
                        • In anticipo (07:55) → normalizzato (08:00) • In ritardo (08:05) → non normalizzato (08:05)
                        <br />
                        <em>Chi arriva in ritardo mantiene l'orario effettivo. I timesheet originali restano invariati.</em>
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              )}

              {companySettings && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Impostazioni aziendali:</strong> {
                      companySettings.enable_entry_tolerance 
                        ? `Abilitato - Orario ${companySettings.standard_start_time || '08:00'} con tolleranza ±${companySettings.entry_tolerance_minutes || 10} minuti`
                        : 'Disabilitato'
                    }
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Overtime Conversion Settings */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Conversione Straordinari in Trasferte
            </CardTitle>
            <CardDescription>
              Sistema ibrido per convertire ore straordinarie in trasferte quando eccedono i limiti mensili
              {companySettings && (
                <span className="ml-2 text-xs font-medium">
                  (Aziendale: {companySettings.enable_overtime_conversion ? 'Abilitato' : 'Disabilitato'}
                  {companySettings.enable_overtime_conversion && ` - €${companySettings.default_overtime_conversion_rate || 12}/h`})
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Sistema di Conversione</Label>
                <Select
                  value={settings.enable_overtime_conversion === null ? 'company_default' : (settings.enable_overtime_conversion ? 'enabled' : 'disabled')}
                  onValueChange={(value) => {
                    if (value === 'company_default') {
                      updateSetting('enable_overtime_conversion', null);
                    } else {
                      updateSetting('enable_overtime_conversion', value === 'enabled');
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={companySettings ? `Default: ${companySettings.enable_overtime_conversion ? 'Abilitato' : 'Disabilitato'}` : 'Seleziona'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                    <SelectItem value="enabled">Abilitato per questo dipendente</SelectItem>
                    <SelectItem value="disabled">Disabilitato per questo dipendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show custom fields only if enabled for this employee or using company default with conversion enabled */}
              {(settings.enable_overtime_conversion === true || 
                (settings.enable_overtime_conversion === null && companySettings?.enable_overtime_conversion)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                  <div>
                    <Label htmlFor="emp_overtime_conversion_rate">
                      Tariffa Conversione Personalizzata (€/h)
                    </Label>
                    <Input
                      id="emp_overtime_conversion_rate"
                      type="number"
                      min="0"
                      step="0.01"
                      value={settings.overtime_conversion_rate || ''}
                      onChange={(e) => updateSetting('overtime_conversion_rate', parseFloat(e.target.value) || null)}
                      placeholder={companySettings?.default_overtime_conversion_rate?.toString() || '12.00'}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Effettivo: €{getEffectiveValue(settings.overtime_conversion_rate, companySettings?.default_overtime_conversion_rate) || 12.00}/h
                    </p>
                   </div>
                   
                   <div className="col-span-full">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        <strong>Funzionamento:</strong> Gli straordinari possono essere convertiti manualmente dalla dashboard Cedolino.
                        <br />
                        <strong>Esempio:</strong> Tariffa €{getEffectiveValue(settings.overtime_conversion_rate, companySettings?.default_overtime_conversion_rate) || 12}/h
                        <br />
                        • Admin può aggiungere conversioni manuali dalla dashboard
                        <br />
                        <em>Le conversioni modificano solo la visualizzazione dashboard, i timesheet originali restano invariati.</em>
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              )}

              {companySettings && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Impostazioni aziendali:</strong> {
                      companySettings.enable_overtime_conversion 
                        ? `Abilitato - Tariffa €${companySettings.default_overtime_conversion_rate || 12}/h (solo conversioni manuali)`
                        : 'Disabilitato'
                    }
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Application Date Selection */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Data di Applicazione Modifiche
            </CardTitle>
            <CardDescription>
              Scegli quando le modifiche alle impostazioni entreranno in vigore
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <RadioGroup
                value={applicationType}
                onValueChange={(value: 'from_today' | 'from_date' | 'retroactive') => setApplicationType(value)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="from_today" id="from_today" />
                  <Label htmlFor="from_today" className="cursor-pointer">
                    <div>
                      <div className="font-medium">Applica da oggi</div>
                      <div className="text-sm text-muted-foreground">
                        Le modifiche si applicano da oggi in avanti. I calcoli passati rimangono invariati.
                      </div>
                    </div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="from_date" id="from_date" />
                  <Label htmlFor="from_date" className="cursor-pointer">
                    <div>
                      <div className="font-medium">Applica da data specifica</div>
                      <div className="text-sm text-muted-foreground">
                        Le modifiche si applicano dalla data selezionata in avanti.
                      </div>
                    </div>
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="retroactive" id="retroactive" />
                  <Label htmlFor="retroactive" className="cursor-pointer">
                    <div>
                      <div className="font-medium text-orange-700">Modifica retroattiva totale</div>
                      <div className="text-sm text-orange-600">
                        ⚠️ Le modifiche si applicano a tutto lo storico. Tutti i calcoli passati verranno aggiornati.
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>

              {applicationType === 'from_date' && (
                <div className="ml-6 mt-4">
                  <Label>Seleziona la data di inizio</Label>
                  <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal mt-2",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "dd MMMM yyyy", { locale: it }) : "Seleziona una data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          setSelectedDate(date);
                          setShowDatePicker(false);
                        }}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {applicationType === 'retroactive' && (
                <Alert className="bg-orange-100 border-orange-300">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800">
                    <strong>Attenzione:</strong> La modifica retroattiva aggiornerà tutti i calcoli esistenti per questo dipendente. 
                    Questa operazione potrebbe richiedere alcuni minuti e influenzerà report e export già generati.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};