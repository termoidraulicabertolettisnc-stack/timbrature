import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coffee } from 'lucide-react';
import { LUNCH_BREAK_OPTIONS, SectionProps } from '../types';

export function LunchBreakSection({ settings, companySettings, updateSetting }: SectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coffee className="h-5 w-5" />
          Pausa Pranzo Personalizzata
        </CardTitle>
        <CardDescription>
          Configurazione specifica per questo dipendente (sovrascrive quella aziendale)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="use_custom_lunch"
              checked={!!settings.lunch_break_type}
              onCheckedChange={(checked) => {
                if (checked) {
                  updateSetting('lunch_break_type', '60_minuti');
                  updateSetting('lunch_break_min_hours', 6.5);
                } else {
                  updateSetting('lunch_break_type', null);
                  updateSetting('lunch_break_min_hours', null);
                }
              }}
            />
            <Label htmlFor="use_custom_lunch">Usa configurazione personalizzata per pausa pranzo</Label>
          </div>

          {settings.lunch_break_type && (
            <>
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
                    {LUNCH_BREAK_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {settings.lunch_break_type !== '0_minuti' && settings.lunch_break_type !== 'libera' && (
                <div>
                  <Label htmlFor="employee_lunch_break_min_hours">
                    Ore minime di lavoro per applicare la pausa
                  </Label>
                  <Input
                    id="employee_lunch_break_min_hours"
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={settings.lunch_break_min_hours || 6}
                    onChange={(e) =>
                      updateSetting(
                        'lunch_break_min_hours',
                        e.target.value ? parseFloat(e.target.value) : 6,
                      )
                    }
                  />
                </div>
              )}
            </>
          )}

          {!settings.lunch_break_type && companySettings?.lunch_break_type && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-sm text-gray-600">
                <strong>Configurazione Aziendale:</strong>{' '}
                {LUNCH_BREAK_OPTIONS.find((opt) => opt.value === companySettings.lunch_break_type)?.label}
                {companySettings.lunch_break_min_hours &&
                  companySettings.lunch_break_type !== '0_minuti' &&
                  companySettings.lunch_break_type !== 'libera' && (
                    <span> (applicata dopo {companySettings.lunch_break_min_hours} ore)</span>
                  )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
