import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings, Clock, Coffee, Calendar, Moon, Gift, Save, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { syncEmployeeSettingsStructure } from '@/utils/syncEmployeeSettings';

interface CompanySettings {
  id: string;
  company_id: string;
  standard_weekly_hours: any;
  lunch_break_type: '0_minuti' | '15_minuti' | '30_minuti' | '45_minuti' | '60_minuti' | '90_minuti' | '120_minuti' | 'libera';
  overtime_calculation: 'dopo_8_ore' | 'sempre';
  saturday_handling: 'trasferta' | 'straordinario';
  meal_voucher_policy: 'oltre_6_ore' | 'sempre_parttime' | 'conteggio_giorni' | 'disabilitato';
  night_shift_start: string;
  night_shift_end: string;
  overtime_monthly_compensation: boolean;
  business_trip_rate_with_meal: number;
  business_trip_rate_without_meal: number;
  saturday_hourly_rate: number;
  meal_voucher_amount: number;
  // Allineato ai nomi reali nel database
  default_daily_allowance_amount: number;
  meal_allowance_policy: 'disabled' | 'meal_vouchers_only' | 'meal_vouchers_always' | 'daily_allowance' | 'both';
  default_daily_allowance_min_hours: number;
  meal_voucher_min_hours: number;
  created_at: string;
  updated_at: string;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setSettings((data as unknown as CompanySettings) || null);
      } else {
        // Crea impostazioni di default se non esistono
        await createDefaultSettings();
      }

    } catch (error) {
      console.error('Error loading settings:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle configurazioni",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createDefaultSettings = async () => {
    try {
      // Prima ottieni l'ID dell'azienda dall'utente corrente
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (profileError) throw profileError;

      const defaultSettings = {
        company_id: profileData.company_id,
        standard_weekly_hours: {
          lun: 8, mar: 8, mer: 8, gio: 8, ven: 8, sab: 0, dom: 0
        },
        lunch_break_type: '60_minuti' as const,
        overtime_calculation: 'dopo_8_ore' as const,
        saturday_handling: 'trasferta' as const,
        meal_voucher_policy: 'oltre_6_ore' as const,
        night_shift_start: '20:00:00',
        night_shift_end: '05:00:00',
        overtime_monthly_compensation: false,
        business_trip_rate_with_meal: 30.98,
        business_trip_rate_without_meal: 46.48,
        saturday_hourly_rate: 10.00,
        meal_voucher_amount: 8.00,
        default_daily_allowance_amount: 10.00,
        meal_allowance_policy: 'meal_vouchers_only' as const,
        default_daily_allowance_min_hours: 6,
        meal_voucher_min_hours: 6,
      };

      const { data, error } = await supabase
        .from('company_settings')
        .insert(defaultSettings)
        .select()
        .single();

      if (error) throw error;
      setSettings((data as unknown as CompanySettings) || null);

    } catch (error) {
      console.error('Error creating default settings:', error);
      toast({
        title: "Errore",
        description: "Errore nella creazione delle configurazioni di default",
        variant: "destructive",
      });
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
          overtime_calculation: settings.overtime_calculation,
          saturday_handling: settings.saturday_handling,
          meal_voucher_policy: settings.meal_voucher_policy,
          night_shift_start: settings.night_shift_start,
          night_shift_end: settings.night_shift_end,
          overtime_monthly_compensation: settings.overtime_monthly_compensation,
          business_trip_rate_with_meal: settings.business_trip_rate_with_meal,
          business_trip_rate_without_meal: settings.business_trip_rate_without_meal,
          saturday_hourly_rate: settings.saturday_hourly_rate,
          meal_voucher_amount: settings.meal_voucher_amount,
          default_daily_allowance_amount: settings.default_daily_allowance_amount,
          meal_allowance_policy: settings.meal_allowance_policy,
          default_daily_allowance_min_hours: settings.default_daily_allowance_min_hours,
          meal_voucher_min_hours: settings.meal_voucher_min_hours,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Configurazioni salvate con successo",
      });

      setHasChanges(false);

      // Synchronize employee settings structure after company settings are saved
      if (settings.company_id) {
        const syncResult = await syncEmployeeSettingsStructure(settings.company_id);
        if (!syncResult.success) {
          console.warn('Employee settings sync failed:', syncResult.error);
          toast({
            title: "Avviso",
            description: "Configurazioni aziendali salvate, ma sincronizzazione dipendenti parzialmente fallita",
            variant: "default",
          });
        }
      }

    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Errore",
        description: "Errore nel salvataggio delle configurazioni",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof CompanySettings, value: any) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: value } : null);
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
        {/* Orario di Lavoro Settimanale */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Orario di Lavoro Settimanale Standard
            </CardTitle>
            <CardDescription>
              Configura l'orario di lavoro standard per ciascun giorno della settimana
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
              {[
                { key: 'lun', label: 'Lunedì' },
                { key: 'mar', label: 'Martedì' },
                { key: 'mer', label: 'Mercoledì' },
                { key: 'gio', label: 'Giovedì' },
                { key: 'ven', label: 'Venerdì' },
                { key: 'sab', label: 'Sabato' },
                { key: 'dom', label: 'Domenica' }
              ].map((day) => (
                <div key={day.key} className="space-y-2">
                  <Label htmlFor={day.key}>{day.label}</Label>
                  <Input
                    id={day.key}
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={settings.standard_weekly_hours?.[day.key] || 0}
                    onChange={(e) => updateSetting('standard_weekly_hours', {
                      ...settings.standard_weekly_hours,
                      [day.key]: parseFloat(e.target.value) || 0
                    })}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Ore di lavoro standard per ciascun giorno (utilizzate per calcolo straordinari)
            </p>
          </CardContent>
        </Card>

        {/* Pausa Pranzo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5" />
              Gestione Pausa Pranzo
            </CardTitle>
            <CardDescription>
              Configura come gestire la pausa pranzo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lunch_break">Tipo Pausa Pranzo</Label>
              <Select 
                value={settings.lunch_break_type} 
                onValueChange={(value) => updateSetting('lunch_break_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0_minuti">Nessuna Pausa</SelectItem>
                  <SelectItem value="15_minuti">15 Minuti Fissi</SelectItem>
                  <SelectItem value="30_minuti">30 Minuti Fissi</SelectItem>
                  <SelectItem value="45_minuti">45 Minuti Fissi</SelectItem>
                  <SelectItem value="60_minuti">60 Minuti Fissi</SelectItem>
                  <SelectItem value="90_minuti">90 Minuti Fissi</SelectItem>
                  <SelectItem value="120_minuti">120 Minuti Fissi</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.lunch_break_type === '0_minuti' && 'Nessuna pausa pranzo detratta'}
                {settings.lunch_break_type === '15_minuti' && 'Pausa pranzo fissa di 15 minuti detratta automaticamente'}
                {settings.lunch_break_type === '30_minuti' && 'Pausa pranzo fissa di 30 minuti detratta automaticamente'}
                {settings.lunch_break_type === '45_minuti' && 'Pausa pranzo fissa di 45 minuti detratta automaticamente'}
                {settings.lunch_break_type === '60_minuti' && 'Pausa pranzo fissa di 60 minuti detratta automaticamente'}
                {settings.lunch_break_type === '90_minuti' && 'Pausa pranzo fissa di 90 minuti detratta automaticamente'}
                {settings.lunch_break_type === '120_minuti' && 'Pausa pranzo fissa di 120 minuti detratta automaticamente'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Calcolo Straordinari */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Calcolo Straordinari
            </CardTitle>
            <CardDescription>
              Configura quando iniziano a contare gli straordinari
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="overtime">Calcolo Straordinari</Label>
              <Select 
                value={settings.overtime_calculation} 
                onValueChange={(value) => updateSetting('overtime_calculation', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dopo_8_ore">Dopo Ore Standard Giornaliere</SelectItem>
                  <SelectItem value="sempre">Sempre</SelectItem>
                </SelectContent>
              </Select>
               <p className="text-xs text-muted-foreground">
                {settings.overtime_calculation === 'dopo_8_ore' && 'Straordinari calcolati dopo le ore standard configurate per giorno'}
                {settings.overtime_calculation === 'sempre' && 'Straordinari sempre calcolati'}
               </p>
            </div>
          </CardContent>
        </Card>

        {/* Compenso Mensile Straordinari */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Compenso Straordinari
            </CardTitle>
            <CardDescription>
              Configura se i dipendenti ricevono compenso mensile per straordinari
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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
              <p className="text-xs text-muted-foreground">
                {settings.overtime_monthly_compensation 
                  ? 'I dipendenti ricevono un compenso mensile per le ore di straordinario' 
                  : 'Nessun compenso mensile specifico per straordinari'
                }
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Gestione Sabato */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Gestione Sabato
            </CardTitle>
            <CardDescription>
              Configura come vengono trattate le ore lavorate il sabato
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="saturday">Trattamento Sabato</Label>
              <Select 
                value={settings.saturday_handling} 
                onValueChange={(value) => updateSetting('saturday_handling', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trasferta">Conteggio Separato (Trasferta)</SelectItem>
                  <SelectItem value="straordinario">Come Straordinario</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.saturday_handling === 'trasferta' && 'Le ore del sabato vengono conteggiate separatamente'}
                {settings.saturday_handling === 'straordinario' && 'Le ore del sabato vengono conteggiate come straordinari'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Policy Buoni Pasto e Indennità Unificata */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Policy Buoni Pasto e Indennità Unificata
            </CardTitle>
            <CardDescription>
              Configura la policy unificata per buoni pasto e indennità giornaliere (mutualmente esclusivi)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meal_voucher_policy">Policy Buoni Pasto</Label>
              <Select 
                value={settings.meal_voucher_policy} 
                onValueChange={(value) => updateSetting('meal_voucher_policy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabilitato">Disabilitato</SelectItem>
                  <SelectItem value="oltre_6_ore">Oltre 6 ore</SelectItem>
                  <SelectItem value="sempre_parttime">Sempre per Part-time</SelectItem>
                  <SelectItem value="conteggio_giorni">Conteggio Giorni</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.meal_voucher_policy === 'disabilitato' && 'Buoni pasto disabilitati'}
                {settings.meal_voucher_policy === 'oltre_6_ore' && 'Buoni pasto assegnati oltre le 6 ore lavorative'}
                {settings.meal_voucher_policy === 'sempre_parttime' && 'Buoni pasto sempre assegnati per part-time'}
                {settings.meal_voucher_policy === 'conteggio_giorni' && 'Buoni pasto basati su conteggio giorni lavorativi'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Orario Notturno */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5" />
              Orario Notturno
            </CardTitle>
            <CardDescription>
              Configura gli orari per il calcolo delle ore notturne
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="night_start">Inizio Orario Notturno</Label>
                <Input
                  id="night_start"
                  type="time"
                  value={settings.night_shift_start}
                  onChange={(e) => updateSetting('night_shift_start', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="night_end">Fine Orario Notturno</Label>
                <Input
                  id="night_end"
                  type="time"
                  value={settings.night_shift_end}
                  onChange={(e) => updateSetting('night_shift_end', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Le ore lavorate tra {settings.night_shift_start} e {settings.night_shift_end} vengono considerate notturne
            </p>
          </CardContent>
        </Card>

        {/* Importi e Configurazioni */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Importi e Configurazioni
            </CardTitle>
            <CardDescription>
              Configura gli importi per buoni pasto, indennità e tariffe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meal_voucher_amount">Importo Buono Pasto (€)</Label>
                <Input
                  id="meal_voucher_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.meal_voucher_amount}
                  onChange={(e) => updateSetting('meal_voucher_amount', parseFloat(e.target.value) || 8.00)}
                />
                <p className="text-xs text-muted-foreground">
                  Importo del buono pasto giornaliero
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="default_daily_allowance_amount">Importo Indennità Giornaliera (€)</Label>
                <Input
                  id="default_daily_allowance_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.default_daily_allowance_amount}
                  onChange={(e) => updateSetting('default_daily_allowance_amount', parseFloat(e.target.value) || 10.00)}
                />
                <p className="text-xs text-muted-foreground">
                  Importo dell'indennità giornaliera
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="default_daily_allowance_min_hours">Ore Minime per Indennità</Label>
                <Input
                  id="default_daily_allowance_min_hours"
                  type="number"
                  min="0"
                  max="12"
                  step="0.5"
                  value={settings.default_daily_allowance_min_hours}
                  onChange={(e) => updateSetting('default_daily_allowance_min_hours', parseInt(e.target.value) || 6)}
                />
                <p className="text-xs text-muted-foreground">
                  Ore minime per ottenere l'indennità giornaliera
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="meal_voucher_min_hours">Ore Minime per Buono Pasto</Label>
                <Input
                  id="meal_voucher_min_hours"
                  type="number"
                  min="0"
                  max="12"
                  step="0.5"
                  value={settings.meal_voucher_min_hours}
                  onChange={(e) => updateSetting('meal_voucher_min_hours', parseInt(e.target.value) || 6)}
                />
                <p className="text-xs text-muted-foreground">
                  Ore minime per ottenere il buono pasto
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="saturday_rate">Tariffa Sabato (€/h)</Label>
                <Input
                  id="saturday_rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.saturday_hourly_rate}
                  onChange={(e) => updateSetting('saturday_hourly_rate', parseFloat(e.target.value) || 10.00)}
                />
                <p className="text-xs text-muted-foreground">
                  Tariffa oraria per le ore lavorate il sabato (quando configurato come trasferta)
                </p>
              </div>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business_trip_with_meal">Tariffa Trasferta con Vitto (€)</Label>
                <Input
                  id="business_trip_with_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_with_meal}
                  onChange={(e) => updateSetting('business_trip_rate_with_meal', parseFloat(e.target.value) || 30.98)}
                />
                <p className="text-xs text-muted-foreground">
                  Tariffa giornaliera per trasferte quando il vitto è incluso
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="business_trip_without_meal">Tariffa Trasferta senza Vitto (€)</Label>
                <Input
                  id="business_trip_without_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_without_meal}
                  onChange={(e) => updateSetting('business_trip_rate_without_meal', parseFloat(e.target.value) || 46.48)}
                />
                <p className="text-xs text-muted-foreground">
                  Tariffa giornaliera per trasferte quando il vitto non è incluso
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}