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
import { toast } from 'sonner';
import { AlertTriangle, Save, RotateCcw } from 'lucide-react';

interface EmployeeSettings {
  id?: string;
  user_id: string;
  company_id: string;
  standard_weekly_hours: any;
  lunch_break_type: string | null;
  overtime_calculation: string | null;
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
}

interface CompanySettings {
  standard_weekly_hours: any;
  lunch_break_type: '0_minuti' | '15_minuti' | '30_minuti' | '45_minuti' | '60_minuti' | '90_minuti' | '120_minuti' | 'libera';
  overtime_calculation: 'dopo_8_ore' | 'sempre';
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
    overtime_calculation: null,
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
  });
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [companies, setCompanies] = useState<Array<{id: string, name: string}>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(employee.company_id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

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

      // Load employee specific settings
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .eq('user_id', employee.id)
        .eq('company_id', selectedCompanyId)
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
          overtime_calculation: null,
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

      // First update the employee's company assignment
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ company_id: selectedCompanyId })
        .eq('user_id', employee.id);

      if (profileError) throw profileError;

      const settingsData = {
        ...settings,
        user_id: employee.id,
        company_id: selectedCompanyId,
        created_by: user.id,
        updated_by: user.id,
      } as any; // Cast to any to handle Supabase type compatibility

      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from('employee_settings')
        .upsert(settingsData, {
          onConflict: 'user_id,company_id'
        });

      if (error) throw error;

      toast.success('Impostazioni salvate con successo');
      setHasChanges(false);
      onEmployeeUpdate?.(); // Refresh the parent component
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni');
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
      overtime_calculation: null,
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
              </div>
            </CardContent>
          </Card>

          {/* Overtime */}
          <Card>
            <CardHeader>
              <CardTitle>Calcolo Straordinari</CardTitle>
              <CardDescription>
                Come vengono calcolati gli straordinari
                {companySettings && ` (Aziendale: ${companySettings.overtime_calculation})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Calcolo Straordinari</Label>
                  <Select
                    value={settings.overtime_calculation || 'company_default'}
                    onValueChange={(value) => updateSetting('overtime_calculation', value === 'company_default' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={companySettings ? `Default: ${companySettings.overtime_calculation}` : 'Seleziona metodo'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                      <SelectItem value="dopo_8_ore">
                        Dopo Ore Standard Giornaliere
                      </SelectItem>
                      <SelectItem value="sempre">Sempre</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.overtime_calculation, companySettings?.overtime_calculation)}
                  </p>
                </div>
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
                      <SelectItem value="meal_vouchers_always">Buoni pasto sempre</SelectItem>
                      <SelectItem value="daily_allowance">Indennità giornaliera</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue((settings as any).meal_allowance_policy, (companySettings as any)?.meal_allowance_policy || 'disabled')}
                  </p>
                </div>

                {/* Conditional Fields for Daily Allowance */}
                {((settings as any).meal_allowance_policy === 'daily_allowance' || (!(settings as any).meal_allowance_policy && (companySettings as any)?.meal_allowance_policy === 'daily_allowance')) && (
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
                {((settings as any).meal_allowance_policy === 'meal_vouchers_only' || (settings as any).meal_allowance_policy === 'meal_vouchers_always' || 
                  (!(settings as any).meal_allowance_policy && ((companySettings as any)?.meal_allowance_policy === 'meal_vouchers_only' || (companySettings as any)?.meal_allowance_policy === 'meal_vouchers_always'))) && (
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
                      {((settings as any).meal_allowance_policy === 'meal_vouchers_only' || 
                        (!(settings as any).meal_allowance_policy && (companySettings as any)?.meal_allowance_policy === 'meal_vouchers_only')) && (
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


          {/* Saturday Hourly Rate - Show only when Saturday is handled as business trip */}
          {(getEffectiveValue(settings.saturday_handling, companySettings?.saturday_handling)) === 'trasferta' && (
            <Card>
              <CardHeader>
                <CardTitle>Tariffa Oraria Sabato</CardTitle>
                <CardDescription>
                  Tariffa oraria personalizzata per le ore lavorate nei sabati pagati in trasferte
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
                    <strong>Info:</strong> Questa tariffa viene applicata per tutte le ore lavorate nei sabati quando sono configurati come "trasferte".
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Per i sabati configurati come "straordinari", viene applicata la normale tariffa straordinaria.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
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