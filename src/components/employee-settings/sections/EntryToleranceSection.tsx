import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { SectionProps, getEffectiveValue } from '../types';

export function EntryToleranceSection({ settings, companySettings, updateSetting }: SectionProps) {
  const showFields =
    settings.enable_entry_tolerance === true ||
    (settings.enable_entry_tolerance === null && companySettings?.enable_entry_tolerance);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sistema di Tolleranza Orario</CardTitle>
        <CardDescription>
          Configurazione personalizzata per la tolleranza orario ingresso
          {companySettings && (
            <span>
              {' '}
              (Aziendale: {companySettings.enable_entry_tolerance ? 'Abilitato' : 'Disabilitato'}
              {companySettings.enable_entry_tolerance &&
                ` - ${companySettings.standard_start_time} ±${companySettings.entry_tolerance_minutes}min`}
              )
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label>Sistema di Tolleranza</Label>
            <Select
              value={
                settings.enable_entry_tolerance === null
                  ? 'company_default'
                  : settings.enable_entry_tolerance
                    ? 'enabled'
                    : 'disabled'
              }
              onValueChange={(value) => {
                if (value === 'company_default') updateSetting('enable_entry_tolerance', null);
                else updateSetting('enable_entry_tolerance', value === 'enabled');
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companySettings
                      ? `Default: ${companySettings.enable_entry_tolerance ? 'Abilitato' : 'Disabilitato'}`
                      : 'Seleziona'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                <SelectItem value="enabled">Abilitato per questo dipendente</SelectItem>
                <SelectItem value="disabled">Disabilitato per questo dipendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showFields && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
              <div>
                <Label htmlFor="emp_standard_start_time">Orario Standard Personalizzato (HH:MM)</Label>
                <Input
                  id="emp_standard_start_time"
                  type="time"
                  value={settings.standard_start_time || ''}
                  onChange={(e) => updateSetting('standard_start_time', e.target.value || null)}
                  placeholder={companySettings?.standard_start_time || '08:00'}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Effettivo:{' '}
                  {getEffectiveValue(settings.standard_start_time, companySettings?.standard_start_time) || '08:00'}
                </p>
              </div>

              <div>
                <Label htmlFor="emp_entry_tolerance_minutes">Tolleranza Personalizzata (Minuti)</Label>
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
                  Effettivo: ±
                  {getEffectiveValue(settings.entry_tolerance_minutes, companySettings?.entry_tolerance_minutes) || 10}{' '}
                  minuti
                </p>
              </div>

              <div className="col-span-full">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Funzionamento:</strong> Solo gli orari di ingresso IN ANTICIPO entro la tolleranza
                    verranno normalizzati all'orario standard nelle dashboard.
                    <br />
                    <strong>Esempio:</strong> Orario{' '}
                    {getEffectiveValue(settings.standard_start_time, companySettings?.standard_start_time) || '08:00'},
                    tolleranza{' '}
                    {getEffectiveValue(settings.entry_tolerance_minutes, companySettings?.entry_tolerance_minutes) ||
                      10}{' '}
                    min prima
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
                <strong>Impostazioni aziendali:</strong>{' '}
                {companySettings.enable_entry_tolerance
                  ? `Abilitato - Orario ${companySettings.standard_start_time || '08:00'} con tolleranza ±${companySettings.entry_tolerance_minutes || 10} minuti`
                  : 'Disabilitato'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
