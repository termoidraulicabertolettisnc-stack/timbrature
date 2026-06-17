import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompanySettings, EmployeeSettings } from '../types';

interface CompanyAndHoursSectionProps {
  settings: EmployeeSettings;
  companySettings: CompanySettings | null;
  companies: Array<{ id: string; name: string }>;
  selectedCompanyId: string;
  onCompanyChange: (id: string) => void;
  updateSetting: (key: string, value: any) => void;
}

export function CompanyAndHoursSection({
  settings,
  companySettings,
  companies,
  selectedCompanyId,
  onCompanyChange,
  updateSetting,
}: CompanyAndHoursSectionProps) {
  const days = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'] as const;
  const dayNames: Record<string, string> = {
    lun: 'Lunedì',
    mar: 'Martedì',
    mer: 'Mercoledì',
    gio: 'Giovedì',
    ven: 'Venerdì',
    sab: 'Sabato',
    dom: 'Domenica',
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Azienda di Appartenenza</CardTitle>
          <CardDescription>Seleziona l'azienda per questo dipendente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Azienda</Label>
              <Select value={selectedCompanyId} onValueChange={onCompanyChange}>
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

      <Card>
        <CardHeader>
          <CardTitle>Orario di Lavoro Settimanale</CardTitle>
          <CardDescription>Ore di lavoro standard per ogni giorno della settimana</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {days.map((day) => {
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
                      const newHours = settings.standard_weekly_hours
                        ? { ...settings.standard_weekly_hours }
                        : {};
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
          {companySettings?.standard_weekly_hours && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Valori aziendali:</strong>{' '}
                {Object.entries(companySettings.standard_weekly_hours)
                  .map(([day, hours]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${hours}h`)
                  .join(', ')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
