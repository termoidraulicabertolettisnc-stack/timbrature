import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
// RadioGroup removed - no longer needed
import { Settings, Clock, Coffee, Calendar, Moon, Gift, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { syncEmployeeSettingsStructure } from '@/utils/syncEmployeeSettings';

interface CompanySettings {
  id?: string;
  company_id: string;
  standard_weekly_hours: any;
  lunch_break_type: '0_minuti' | '15_minuti' | '30_minuti' | '45_minuti' | '60_minuti' | '90_minuti' | '120_minuti' | 'libera' | null;
  saturday_handling: 'trasferta' | 'straordinario' | null;
  meal_allowance_policy: 'disabled' | 'meal_vouchers_only' | 'daily_allowance' | 'both' | null;
  night_shift_start: string | null;
  night_shift_end: string | null;
  overtime_monthly_compensation?: boolean | null;
  business_trip_rate_with_meal: number | null;
  business_trip_rate_without_meal: number | null;
  saturday_hourly_rate: number | null;
  meal_voucher_amount: number | null;
  default_daily_allowance_amount: number | null;
  default_daily_allowance_min_hours: number | null;
  meal_voucher_min_hours: number | null;
  // Entry tolerance fields
  enable_entry_tolerance?: boolean | null;
  standard_start_time?: string | null;
  entry_tolerance_minutes?: number | null;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<CompanySettings>({
    company_id: '',
    standard_weekly_hours: null,
    lunch_break_type: null,
    saturday_handling: null,
    meal_allowance_policy: null,
    night_shift_start: null,
    night_shift_end: null,
    overtime_monthly_compensation: null,
    business_trip_rate_with_meal: null,
    business_trip_rate_without_meal: null,
    saturday_hourly_rate: null,
    meal_voucher_amount: null,
    default_daily_allowance_amount: null,
    default_daily_allowance_min_hours: null,
    meal_voucher_min_hours: null,
    // Entry tolerance fields
    enable_entry_tolerance: null,
    standard_start_time: null,
    entry_tolerance_minutes: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Get current user's company
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('User not authenticated');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.user.id)
        .single();

      if (profileError) throw profileError;

      // Load company settings
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as CompanySettings);
      } else {
        // Create default settings if none exist
        await createDefaultSettings(profile.company_id);
      }

    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Errore nel caricamento delle configurazioni');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultSettings = async (companyId: string) => {
    try {
      const defaultSettings = {
        company_id: companyId,
        standard_weekly_hours: {
          lun: 8, mar: 8, mer: 8, gio: 8, ven: 8, sab: 0, dom: 0
        },
        lunch_break_type: '60_minuti' as const,
        saturday_handling: 'trasferta' as const,
        meal_voucher_policy: 'oltre_6_ore' as const,
        night_shift_start: '20:00:00',
        night_shift_end: '05:00:00',
        overtime_monthly_compensation: false,
        business_trip_rate_with_meal: 30.98,
        business_trip_rate_without_meal: 46.48,
        saturday_hourly_rate: 10.00,
        meal_voucher_amount: 8.00,
        daily_allowance_amount: 10.00,
        daily_allowance_policy: 'disabled' as const,
        daily_allowance_min_hours: 6,
        meal_voucher_min_hours: 6,
        // Entry tolerance defaults
        enable_entry_tolerance: false,
        standard_start_time: '08:00:00',
        entry_tolerance_minutes: 10,
      };

      const { data, error } = await supabase
        .from('company_settings')
        .insert(defaultSettings)
        .select()
        .single();

      if (error) throw error;
      setSettings(data as CompanySettings);

    } catch (error) {
      console.error('Error creating default settings:', error);
      toast.error('Errore nella creazione delle configurazioni di default');
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({
          standard_weekly_hours: settings.standard_weekly_hours,
          lunch_break_type: settings.lunch_break_type,
          saturday_handling: settings.saturday_handling,
          meal_allowance_policy: settings.meal_allowance_policy,
          night_shift_start: settings.night_shift_start,
          night_shift_end: settings.night_shift_end,
          overtime_monthly_compensation: settings.overtime_monthly_compensation,
          business_trip_rate_with_meal: settings.business_trip_rate_with_meal,
          business_trip_rate_without_meal: settings.business_trip_rate_without_meal,
          saturday_hourly_rate: settings.saturday_hourly_rate,
          meal_voucher_amount: settings.meal_voucher_amount,
          default_daily_allowance_amount: settings.default_daily_allowance_amount,
          default_daily_allowance_min_hours: settings.default_daily_allowance_min_hours,
          meal_voucher_min_hours: settings.meal_voucher_min_hours,
          // Entry tolerance fields
          enable_entry_tolerance: settings.enable_entry_tolerance,
          standard_start_time: settings.standard_start_time,
          entry_tolerance_minutes: settings.entry_tolerance_minutes,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Configurazioni salvate con successo');
      setHasChanges(false);

      // Synchronize employee settings structure after company settings are saved
      if (settings.company_id) {
        const syncResult = await syncEmployeeSettingsStructure(settings.company_id);
        if (!syncResult.success) {
          console.warn('Employee settings sync failed:', syncResult.error);
          toast.error('Configurazioni aziendali salvate, ma sincronizzazione dipendenti parzialmente fallita');
        }
      }

    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Errore nel salvataggio delle configurazioni');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof CompanySettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 animate-spin" />
          <span>Caricamento configurazioni...</span>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Impossibile caricare le configurazioni aziendali.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Configurazioni Aziendali</h2>
          <p className="text-muted-foreground">
            Personalizza le policy e i parametri dell'azienda
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saving}
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salva Modifiche'}
        </Button>
      </div>

      {hasChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Hai modifiche non salvate. Ricordati di salvare prima di uscire.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {/* Work Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Orario di Lavoro Settimanale
            </CardTitle>
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
                      value={settings.standard_weekly_hours?.[day] || 0}
                      onChange={(e) => {
                        const newHours = settings.standard_weekly_hours ? { ...settings.standard_weekly_hours } : {};
                        newHours[day] = e.target.value ? parseFloat(e.target.value) : 0;
                        updateSetting('standard_weekly_hours', newHours);
                      }}
                      className="text-center"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Lunch Break */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Pausa Pranzo
            </CardTitle>
            <CardDescription>
              Configurazione della pausa pranzo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Tipo Pausa Pranzo</Label>
                <Select
                  value={settings.lunch_break_type || ''}
                  onValueChange={(value) => updateSetting('lunch_break_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0_minuti">Nessuna Pausa</SelectItem>
                    <SelectItem value="15_minuti">15 Minuti Fissi</SelectItem>
                    <SelectItem value="30_minuti">30 Minuti Fissi</SelectItem>
                    <SelectItem value="45_minuti">45 Minuti Fissi</SelectItem>
                    <SelectItem value="60_minuti">60 Minuti Fissi</SelectItem>
                    <SelectItem value="90_minuti">90 Minuti Fissi</SelectItem>
                    <SelectItem value="120_minuti">120 Minuti Fissi</SelectItem>
                    <SelectItem value="libera">Libera (Segnata Manualmente)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overtime Monthly Compensation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Compenso Straordinari
            </CardTitle>
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
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Gestione Sabato
            </CardTitle>
            <CardDescription>
              Come vengono trattate le ore lavorate il sabato
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Trattamento Sabato</Label>
                <Select
                  value={settings.saturday_handling || ''}
                  onValueChange={(value) => updateSetting('saturday_handling', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona trattamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trasferta">Conteggio Separato (Trasferta)</SelectItem>
                    <SelectItem value="straordinario">Come Straordinario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="saturday_rate">Tariffa Oraria Sabato (€)</Label>
                <Input
                  id="saturday_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.saturday_hourly_rate || ''}
                  onChange={(e) => updateSetting('saturday_hourly_rate', parseFloat(e.target.value) || null)}
                  placeholder="10.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Meal Benefits - Unified Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Buoni Pasto e Indennità Giornaliera
            </CardTitle>
            <CardDescription>
              Politica unificata per buoni pasto o indennità giornaliera (mutuamente esclusivi)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Politica Buoni Pasto / Indennità</Label>
                <Select
                  value={settings.meal_allowance_policy || 'disabled'}
                  onValueChange={(value) => updateSetting('meal_allowance_policy', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona politica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Tutto disabilitato</SelectItem>
                    <SelectItem value="meal_vouchers_only">Solo buoni pasto</SelectItem>
                    <SelectItem value="daily_allowance">Indennità giornaliera</SelectItem>
                    <SelectItem value="both">Buoni pasto e indennità</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conditional Fields for Daily Allowance */}
              {(settings.meal_allowance_policy === 'daily_allowance' || settings.meal_allowance_policy === 'both') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                  <div>
                    <Label htmlFor="default_daily_allowance_amount">
                      Importo indennità giornaliera (€)
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="default_daily_allowance_amount"
                      type="number"
                      step="0.01"
                      value={settings.default_daily_allowance_amount || ''}
                      onChange={(e) => updateSetting('default_daily_allowance_amount', parseFloat(e.target.value) || null)}
                      placeholder="10.00"
                      className="mt-1"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="default_daily_allowance_min_hours">
                      Ore minime per indennità
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="default_daily_allowance_min_hours"
                      type="number"
                      min="0"
                      max="12"
                      step="0.5"
                      value={settings.default_daily_allowance_min_hours || ''}
                      onChange={(e) => updateSetting('default_daily_allowance_min_hours', parseInt(e.target.value) || null)}
                      placeholder="6"
                      className="mt-1"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Conditional Fields for Meal Vouchers */}
              {(settings.meal_allowance_policy === 'meal_vouchers_only' || settings.meal_allowance_policy === 'both') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                  <div>
                    <Label htmlFor="meal_voucher_amount">
                      Importo buono pasto (€)
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="meal_voucher_amount"
                      type="number"
                      step="0.01"
                      value={settings.meal_voucher_amount || ''}
                      onChange={(e) => updateSetting('meal_voucher_amount', parseFloat(e.target.value) || null)}
                      placeholder="8.00"
                      className="mt-1"
                      required
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="meal_voucher_min_hours">
                      Ore minime per buoni pasto
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="meal_voucher_min_hours"
                      type="number"
                      min="0"
                      max="12"
                      step="0.5"
                      value={settings.meal_voucher_min_hours || ''}
                      onChange={(e) => updateSetting('meal_voucher_min_hours', parseInt(e.target.value) || null)}
                      placeholder="6"
                      className="mt-1"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Night Shift */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Turno Notturno
            </CardTitle>
            <CardDescription>
              Configurazione dell'orario considerato notturno
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="night_start">Inizio Turno Notturno</Label>
                <Input
                  id="night_start"
                  type="time"
                  value={settings.night_shift_start || ''}
                  onChange={(e) => updateSetting('night_shift_start', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="night_end">Fine Turno Notturno</Label>
                <Input
                  id="night_end"
                  type="time"
                  value={settings.night_shift_end || ''}
                  onChange={(e) => updateSetting('night_shift_end', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Business Trip Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Tariffe Trasferta
            </CardTitle>
            <CardDescription>
              Tariffe giornaliere per trasferte con e senza pasto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="business_trip_with_meal">Tariffa con Pasto (€)</Label>
                <Input
                  id="business_trip_with_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_with_meal || ''}
                  onChange={(e) => updateSetting('business_trip_rate_with_meal', parseFloat(e.target.value) || null)}
                  placeholder="30.98"
                />
              </div>
              <div>
                <Label htmlFor="business_trip_without_meal">Tariffa senza Pasto (€)</Label>
                <Input
                  id="business_trip_without_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_without_meal || ''}
                  onChange={(e) => updateSetting('business_trip_rate_without_meal', parseFloat(e.target.value) || null)}
                  placeholder="46.48"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Entry Tolerance System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sistema di Tolleranza Orario
            </CardTitle>
            <CardDescription>
              Configurazione per la normalizzazione degli orari di ingresso nelle dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  id="enable_entry_tolerance"
                  type="checkbox"
                  checked={settings.enable_entry_tolerance || false}
                  onChange={(e) => updateSetting('enable_entry_tolerance', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="enable_entry_tolerance">Abilita Sistema di Tolleranza Orario</Label>
              </div>
              
              {settings.enable_entry_tolerance && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                  <div>
                    <Label htmlFor="standard_start_time">
                      Orario Standard di Inizio (HH:MM)
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="standard_start_time"
                      type="time"
                      value={settings.standard_start_time || '08:00'}
                      onChange={(e) => updateSetting('standard_start_time', e.target.value)}
                      className="mt-1"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Orario di riferimento per la tolleranza
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="entry_tolerance_minutes">
                      Tolleranza in Minuti
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="entry_tolerance_minutes"
                      type="number"
                      min="0"
                      max="60"
                      step="1"
                      value={settings.entry_tolerance_minutes || ''}
                      onChange={(e) => updateSetting('entry_tolerance_minutes', parseInt(e.target.value) || null)}
                      placeholder="10"
                      className="mt-1"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      ±{settings.entry_tolerance_minutes || 10} minuti dall'orario standard
                    </p>
                  </div>
                  
                  <div className="col-span-full">
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Come funziona:</strong> Se un dipendente entra entro ±{settings.entry_tolerance_minutes || 10} minuti dall'orario standard ({settings.standard_start_time || '08:00'}), 
                        nelle dashboard l'orario verrà normalizzato a {settings.standard_start_time || '08:00'}. 
                        <br />
                        <strong>Esempio:</strong> Con orario standard 08:00 e tolleranza 10 minuti:
                        <br />
                        • 07:55 → 08:00 (normalizzato)
                        • 08:05 → 08:00 (normalizzato)  
                        • 07:45 → 07:45 (fuori tolleranza, resta invariato)
                        <br />
                        <em>I timesheet originali non vengono mai modificati.</em>
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}