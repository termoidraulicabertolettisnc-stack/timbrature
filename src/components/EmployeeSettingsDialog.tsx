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
  standard_daily_hours: number | null;
  lunch_break_type: 'libera' | '30_minuti' | '60_minuti' | null;
  overtime_calculation: 'dopo_8_ore' | 'sempre' | null;
  saturday_handling: 'trasferta' | 'straordinario' | null;
  meal_voucher_policy: 'oltre_6_ore' | 'sempre_parttime' | 'conteggio_giorni' | null;
  night_shift_start: string | null;
  night_shift_end: string | null;
}

interface CompanySettings {
  standard_daily_hours: number;
  lunch_break_type: 'libera' | '30_minuti' | '60_minuti';
  overtime_calculation: 'dopo_8_ore' | 'sempre';
  saturday_handling: 'trasferta' | 'straordinario';
  meal_voucher_policy: 'oltre_6_ore' | 'sempre_parttime' | 'conteggio_giorni';
  night_shift_start: string;
  night_shift_end: string;
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
}

export const EmployeeSettingsDialog = ({ employee, open, onOpenChange }: EmployeeSettingsDialogProps) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<EmployeeSettings>({
    user_id: employee.id,
    company_id: employee.company_id,
    standard_daily_hours: null,
    lunch_break_type: null,
    overtime_calculation: null,
    saturday_handling: null,
    meal_voucher_policy: null,
    night_shift_start: null,
    night_shift_end: null,
  });
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open, employee.id]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Load company settings (defaults)
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('*')
        .eq('company_id', employee.company_id)
        .single();

      if (companyError) throw companyError;
      setCompanySettings(companyData);

      // Load employee specific settings
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_settings')
        .select('*')
        .eq('user_id', employee.id)
        .eq('company_id', employee.company_id)
        .maybeSingle();

      if (employeeError) throw employeeError;

      if (employeeData) {
        setSettings(employeeData);
      } else {
        // Reset to default (null values will use company defaults)
        setSettings({
          user_id: employee.id,
          company_id: employee.company_id,
          standard_daily_hours: null,
          lunch_break_type: null,
          overtime_calculation: null,
          saturday_handling: null,
          meal_voucher_policy: null,
          night_shift_start: null,
          night_shift_end: null,
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

      const settingsData = {
        ...settings,
        created_by: user.id,
        updated_by: user.id,
      };

      if (settings.id) {
        // Update existing settings
        const { error } = await supabase
          .from('employee_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Create new settings
        const { error } = await supabase
          .from('employee_settings')
          .insert([settingsData]);

        if (error) throw error;
      }

      toast.success('Impostazioni salvate con successo');
      setHasChanges(false);
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
      company_id: employee.company_id,
      standard_daily_hours: null,
      lunch_break_type: null,
      overtime_calculation: null,
      saturday_handling: null,
      meal_voucher_policy: null,
      night_shift_start: null,
      night_shift_end: null,
    });
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

          {/* Work Hours */}
          <Card>
            <CardHeader>
              <CardTitle>Orario di Lavoro</CardTitle>
              <CardDescription>
                Ore di lavoro standard giornaliere
                {companySettings && ` (Aziendale: ${companySettings.standard_daily_hours} ore)`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="daily-hours">Ore Giornaliere Standard</Label>
                  <Input
                    id="daily-hours"
                    type="number"
                    min="1"
                    max="12"
                    value={settings.standard_daily_hours || ''}
                    onChange={(e) => updateSetting('standard_daily_hours', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder={companySettings ? `Default: ${companySettings.standard_daily_hours}` : ''}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valore effettivo: {getEffectiveValue(settings.standard_daily_hours, companySettings?.standard_daily_hours)} ore
                  </p>
                </div>
              </div>
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
                        Dopo {getEffectiveValue(settings.standard_daily_hours, companySettings?.standard_daily_hours)} Ore Effettive
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

          {/* Meal Vouchers */}
          <Card>
            <CardHeader>
              <CardTitle>Buoni Pasto</CardTitle>
              <CardDescription>
                Politica per l'assegnazione dei buoni pasto
                {companySettings && ` (Aziendale: ${companySettings.meal_voucher_policy})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Politica Buoni Pasto</Label>
                  <Select
                    value={settings.meal_voucher_policy || 'company_default'}
                    onValueChange={(value) => updateSetting('meal_voucher_policy', value === 'company_default' ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={companySettings ? `Default: ${companySettings.meal_voucher_policy}` : 'Seleziona politica'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                      <SelectItem value="oltre_6_ore">Oltre 6 ore</SelectItem>
                      <SelectItem value="sempre_parttime">Sempre per part-time</SelectItem>
                      <SelectItem value="conteggio_giorni">Conteggio giorni</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Valore effettivo: {getEffectiveValue(settings.meal_voucher_policy, companySettings?.meal_voucher_policy)}
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