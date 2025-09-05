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

interface CompanySettings {
  id: string;
  company_id: string;
  standard_daily_hours: number;
  lunch_break_type: 'libera' | '30_minuti' | '60_minuti';
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
  daily_allowance_policy: 'disabled' | 'alternative_to_voucher';
  daily_allowance_min_hours: number;
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
        standard_daily_hours: 8,
        lunch_break_type: '60_minuti' as const,
        overtime_calculation: 'dopo_8_ore' as const,
        saturday_handling: 'trasferta' as const,
        meal_voucher_policy: 'oltre_6_ore' as const,
        night_shift_start: '20:00:00',
        night_shift_end: '05:00:00',
        business_trip_rate_with_meal: 30.98,
        business_trip_rate_without_meal: 46.48,
        saturday_hourly_rate: 10.00,
        meal_voucher_amount: 8.00,
        daily_allowance_amount: 10.00,
        daily_allowance_policy: 'disabled' as const,
        daily_allowance_min_hours: 6,
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
          standard_daily_hours: settings.standard_daily_hours,
          lunch_break_type: settings.lunch_break_type,
          overtime_calculation: settings.overtime_calculation,
          saturday_handling: settings.saturday_handling,
          meal_voucher_policy: settings.meal_voucher_policy,
          night_shift_start: settings.night_shift_start,
          night_shift_end: settings.night_shift_end,
          business_trip_rate_with_meal: settings.business_trip_rate_with_meal,
          business_trip_rate_without_meal: settings.business_trip_rate_without_meal,
          saturday_hourly_rate: settings.saturday_hourly_rate,
          meal_voucher_amount: settings.meal_voucher_amount,
          daily_allowance_amount: settings.daily_allowance_amount,
          daily_allowance_policy: settings.daily_allowance_policy,
          daily_allowance_min_hours: settings.daily_allowance_min_hours,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Configurazioni salvate con successo",
      });

      setHasChanges(false);

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
        {/* Orario di Lavoro */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Orario di Lavoro Standard
            </CardTitle>
            <CardDescription>
              Configura l'orario di lavoro giornaliero standard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily_hours">Ore Giornaliere Standard</Label>
                <Input
                  id="daily_hours"
                  type="number"
                  min="1"
                  max="12"
                  step="0.5"
                  value={settings.standard_daily_hours}
                  onChange={(e) => updateSetting('standard_daily_hours', parseFloat(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Ore di lavoro standard per giorno (utilizzate per calcolo straordinari)
                </p>
              </div>
            </div>
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
                  <SelectItem value="30_minuti">30 Minuti Fissi</SelectItem>
                  <SelectItem value="60_minuti">60 Minuti Fissi</SelectItem>
                  <SelectItem value="libera">Libera (Start/Stop)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.lunch_break_type === '30_minuti' && 'Pausa pranzo fissa di 30 minuti detratta automaticamente'}
                {settings.lunch_break_type === '60_minuti' && 'Pausa pranzo fissa di 60 minuti detratta automaticamente'}
                {settings.lunch_break_type === 'libera' && 'I dipendenti devono registrare inizio e fine pausa pranzo'}
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
                  <SelectItem value="dopo_8_ore">Dopo {settings.standard_daily_hours} Ore Effettive</SelectItem>
                  <SelectItem value="sempre">Sempre</SelectItem>
                </SelectContent>
              </Select>
               <p className="text-xs text-muted-foreground">
                {settings.overtime_calculation === 'dopo_8_ore' && `Straordinari calcolati dopo ${settings.standard_daily_hours} ore di lavoro effettivo`}
                {settings.overtime_calculation === 'sempre' && `Straordinari sempre calcolati`}
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

        {/* Buoni Pasto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Policy Buoni Pasto
            </CardTitle>
            <CardDescription>
              Configura quando vengono assegnati i buoni pasto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meal_voucher">Policy Buoni Pasto</Label>
              <Select 
                value={settings.meal_voucher_policy} 
                onValueChange={(value) => updateSetting('meal_voucher_policy', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oltre_6_ore">Se oltre 6 Ore Effettive</SelectItem>
                  <SelectItem value="sempre_parttime">Sempre per Part-time</SelectItem>
                  <SelectItem value="conteggio_giorni">Conta Giorni oltre 6 Ore</SelectItem>
                  <SelectItem value="disabilitato">Disabilitato</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.meal_voucher_policy === 'oltre_6_ore' && 'Buono pasto assegnato se si lavora più di 6 ore effettive'}
                {settings.meal_voucher_policy === 'sempre_parttime' && 'Buono pasto sempre assegnato ai dipendenti part-time'}
                {settings.meal_voucher_policy === 'conteggio_giorni' && 'Non viene assegnato buono ma si contano i giorni oltre 6 ore per indennità'}
                {settings.meal_voucher_policy === 'disabilitato' && 'I buoni pasto sono completamente disabilitati'}
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

        {/* Meal Vouchers and Daily Allowances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Buoni Pasto e Indennità
            </CardTitle>
            <CardDescription>
              Configura buoni pasto e indennità giornaliera per i dipendenti
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meal_voucher_amount">Importo buono pasto (€)</Label>
                <Input
                  id="meal_voucher_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.meal_voucher_amount}
                  onChange={(e) => updateSetting('meal_voucher_amount', parseFloat(e.target.value) || 8.00)}
                />
                <p className="text-xs text-muted-foreground">
                  Valore del buono pasto giornaliero
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily_allowance_policy">Politica indennità giornaliera</Label>
                <Select 
                  value={settings.daily_allowance_policy} 
                  onValueChange={(value) => updateSetting('daily_allowance_policy', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">Disabilitata</SelectItem>
                    <SelectItem value="alternative_to_voucher">Alternativa al buono pasto</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  L'indennità può sostituire il buono pasto
                </p>
              </div>
            </div>

            {settings.daily_allowance_policy === 'alternative_to_voucher' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daily_allowance_amount">Importo indennità giornaliera (€)</Label>
                  <Input
                    id="daily_allowance_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.daily_allowance_amount}
                    onChange={(e) => updateSetting('daily_allowance_amount', parseFloat(e.target.value) || 10.00)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Importo dell'indennità giornaliera
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily_allowance_min_hours">Ore minime per indennità</Label>
                  <Input
                    id="daily_allowance_min_hours"
                    type="number"
                    min="0"
                    value={settings.daily_allowance_min_hours}
                    onChange={(e) => updateSetting('daily_allowance_min_hours', parseInt(e.target.value) || 6)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ore minime lavorate per avere diritto all'indennità
                  </p>
                </div>
              </div>
            )}

            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">Come funziona:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Buono pasto:</strong> €{settings.meal_voucher_amount} per giorni con più di 6 ore</li>
                {settings.daily_allowance_policy === 'alternative_to_voucher' && (
                  <>
                    <li>• <strong>Indennità giornaliera:</strong> €{settings.daily_allowance_amount} per giorni con almeno {settings.daily_allowance_min_hours} ore</li>
                    <li>• <strong>Alternativa:</strong> I dipendenti ricevono l'indennità INVECE del buono pasto</li>
                  </>
                )}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Business Trip Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Indennità Trasferte
            </CardTitle>
            <CardDescription>
              Configura gli importi per le trasferte di lavoro
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trip_with_meal">Trasferta con buono pasto (€)</Label>
                <Input
                  id="trip_with_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_with_meal}
                  onChange={(e) => updateSetting('business_trip_rate_with_meal', parseFloat(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Importo giornaliero quando è fornito il buono pasto (importo minore)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trip_without_meal">Trasferta senza buono pasto (€)</Label>
                <Input
                  id="trip_without_meal"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.business_trip_rate_without_meal}
                  onChange={(e) => updateSetting('business_trip_rate_without_meal', parseFloat(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Importo giornaliero quando NON è fornito il buono pasto (importo maggiore)
                </p>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">Come funziona:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Sabato in trasferta:</strong> L'importo dipende dal diritto al buono pasto del sabato</li>
                <li>• <strong>Indennità giornaliera:</strong> Quando configurata "in trasferte al posto del buono pasto"</li>
                <li>• <strong>Con buono pasto:</strong> €{settings.business_trip_rate_with_meal} giornalieri</li>
                <li>• <strong>Senza buono pasto:</strong> €{settings.business_trip_rate_without_meal} giornalieri</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Saturday Hourly Rate - Show when Saturday is handled as business trip */}
        {settings.saturday_handling === 'trasferta' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Tariffa Oraria Sabato
              </CardTitle>
              <CardDescription>
                Configura la tariffa oraria predefinita per i sabati pagati in trasferte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="saturday_hourly_rate">Tariffa Oraria Sabato (€/ora)</Label>
                  <Input
                    id="saturday_hourly_rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.saturday_hourly_rate}
                    onChange={(e) => updateSetting('saturday_hourly_rate', parseFloat(e.target.value) || 10.00)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tariffa oraria predefinita per le ore lavorate nei sabati pagati in trasferte. 
                    I dipendenti possono avere tariffe personalizzate che sovrascrivono questa impostazione.
                  </p>
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Come funziona:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <strong>Tipologia A:</strong> Sabati pagati in trasferte con tariffa oraria personalizzabile per dipendente</li>
                  <li>• <strong>Calcolo:</strong> Ore lavorate × Tariffa oraria del sabato</li>
                  <li>• <strong>Personalizzazione:</strong> Ogni dipendente può avere una tariffa diversa (es. €10/h, €12/h, €15/h)</li>
                  <li>• <strong>Export separato:</strong> Le ore del sabato vengono esportate separatamente dalle ore ordinarie/straordinarie</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer con pulsante salva */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || saving}
          size="lg"
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salva Tutte le Modifiche'}
        </Button>
      </div>
    </div>
  );
}