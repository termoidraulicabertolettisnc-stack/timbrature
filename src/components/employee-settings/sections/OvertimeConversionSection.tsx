import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Settings } from 'lucide-react';
import { SectionProps, getEffectiveValue } from '../types';

export function OvertimeConversionSection({ settings, companySettings, updateSetting }: SectionProps) {
  const showFields =
    settings.enable_overtime_conversion === true ||
    (settings.enable_overtime_conversion === null && companySettings?.enable_overtime_conversion);

  return (
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
              {companySettings.enable_overtime_conversion &&
                ` - €${companySettings.default_overtime_conversion_rate || 12}/h`}
              )
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label>Sistema di Conversione</Label>
            <Select
              value={
                settings.enable_overtime_conversion === null
                  ? 'company_default'
                  : settings.enable_overtime_conversion
                    ? 'enabled'
                    : 'disabled'
              }
              onValueChange={(value) => {
                if (value === 'company_default') updateSetting('enable_overtime_conversion', null);
                else updateSetting('enable_overtime_conversion', value === 'enabled');
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companySettings
                      ? `Default: ${companySettings.enable_overtime_conversion ? 'Abilitato' : 'Disabilitato'}`
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
                <Label htmlFor="emp_overtime_conversion_rate">Tariffa Conversione Personalizzata (€/h)</Label>
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
                  Effettivo: €
                  {getEffectiveValue(
                    settings.overtime_conversion_rate,
                    companySettings?.default_overtime_conversion_rate,
                  ) || 12.0}
                  /h
                </p>
              </div>

              <div className="col-span-full">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Funzionamento:</strong> Gli straordinari possono essere convertiti manualmente dalla
                    dashboard Cedolino.
                    <br />
                    <strong>Esempio:</strong> Tariffa €
                    {getEffectiveValue(
                      settings.overtime_conversion_rate,
                      companySettings?.default_overtime_conversion_rate,
                    ) || 12}
                    /h
                    <br />
                    • Admin può aggiungere conversioni manuali dalla dashboard
                    <br />
                    <em>
                      Le conversioni modificano solo la visualizzazione dashboard, i timesheet originali restano
                      invariati.
                    </em>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          )}

          {companySettings && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Impostazioni aziendali:</strong>{' '}
                {companySettings.enable_overtime_conversion
                  ? `Abilitato - Tariffa €${companySettings.default_overtime_conversion_rate || 12}/h (solo conversioni manuali)`
                  : 'Disabilitato'}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
