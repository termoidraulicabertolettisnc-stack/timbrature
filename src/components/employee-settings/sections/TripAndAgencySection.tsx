import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { MapPin, Settings } from 'lucide-react';
import { SectionProps } from '../types';

export function TripAndAgencySection({ settings, updateSetting }: SectionProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Trasferte Manuali
          </CardTitle>
          <CardDescription>
            Se abilitato, le trasferte di questo dipendente vengono assegnate manualmente a fine mese (es. "10
            trasferte") invece di essere calcolate automaticamente dalla policy giornaliera. I giorni con
            trasferta manuale non avranno il buono pasto, applicando la tariffa piena (€46.48).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="manual_trip_mode"
              checked={settings.manual_trip_mode === true}
              onCheckedChange={(checked) => updateSetting('manual_trip_mode', checked === true)}
            />
            <Label htmlFor="manual_trip_mode" className="cursor-pointer">
              Abilita trasferte manuali mensili
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Valore attuale:{' '}
            {settings.manual_trip_mode
              ? '✅ Trasferte manuali attive'
              : '❌ Trasferte automatiche (default)'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Somministrazione
          </CardTitle>
          <CardDescription>
            Se il dipendente è in somministrazione, indica il nome dell'agenzia. I dipendenti somministrati
            verranno esportati separatamente nelle buste paga.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label htmlFor="staffing_agency_name">Nome Agenzia di Somministrazione</Label>
              <Input
                id="staffing_agency_name"
                value={settings.staffing_agency_name || ''}
                onChange={(e) => updateSetting('staffing_agency_name', e.target.value || null)}
                placeholder="Es. Adecco, Manpower, Randstad..."
                className="mt-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {settings.staffing_agency_name
                ? `✅ Somministrato tramite: ${settings.staffing_agency_name}`
                : '❌ Non in somministrazione (dipendente diretto)'}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
