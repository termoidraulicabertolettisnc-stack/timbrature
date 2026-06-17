import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionProps, getEffectiveValue } from '../types';

export function HoursPolicySection({ settings, companySettings, updateSetting }: SectionProps) {
  const saturdayEffective = getEffectiveValue(
    settings.saturday_handling,
    companySettings?.saturday_handling,
  );

  return (
    <>
      {/* Overtime Monthly Compensation (checkbox) */}
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
                onValueChange={(value) =>
                  updateSetting('saturday_handling', value === 'company_default' ? null : value)
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      companySettings ? `Default: ${companySettings.saturday_handling}` : 'Seleziona gestione'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                  <SelectItem value="normale">Normale (ore standard)</SelectItem>
                  <SelectItem value="trasferta">Trasferta (tariffa speciale)</SelectItem>
                  <SelectItem value="straordinario">Straordinario (tutto extra)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Valore effettivo: {saturdayEffective}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Overtime Compensation (select) */}
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
                value={
                  settings.overtime_monthly_compensation === null
                    ? 'company_default'
                    : settings.overtime_monthly_compensation
                      ? 'enabled'
                      : 'disabled'
                }
                onValueChange={(value) =>
                  updateSetting(
                    'overtime_monthly_compensation',
                    value === 'company_default' ? null : value === 'enabled',
                  )
                }
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
                Valore effettivo:{' '}
                {settings.overtime_monthly_compensation === null
                  ? 'Default Aziendale'
                  : settings.overtime_monthly_compensation
                    ? 'Abilitato'
                    : 'Disabilitato'}
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
            {companySettings &&
              ` (Aziendale: ${companySettings.night_shift_start} - ${companySettings.night_shift_end})`}
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
                Valore effettivo:{' '}
                {getEffectiveValue(settings.night_shift_start, companySettings?.night_shift_start)}
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
                Valore effettivo:{' '}
                {getEffectiveValue(settings.night_shift_end, companySettings?.night_shift_end)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saturday Hourly Rate */}
      {(saturdayEffective === 'trasferta' || saturdayEffective === 'straordinario') && (
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
                  onChange={(e) =>
                    updateSetting(
                      'saturday_hourly_rate',
                      e.target.value ? parseFloat(e.target.value) : null,
                    )
                  }
                  placeholder={
                    companySettings ? `Default: €${companySettings.saturday_hourly_rate}/ora` : '€10.00/ora'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Valore effettivo: €
                  {getEffectiveValue(settings.saturday_hourly_rate, companySettings?.saturday_hourly_rate)}/ora
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Info:</strong> Questa tariffa viene applicata solo quando i sabati sono configurati come
                "Trasferte". Per i sabati configurati come "Straordinari" si applica la normale tariffa
                straordinaria.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
