import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Coffee } from 'lucide-react';
import { SectionProps, getEffectiveValue } from '../types';

export function MealAndAllowanceSection({ settings, companySettings, updateSetting }: SectionProps) {
  const s: any = settings;
  const cs: any = companySettings;

  const effectivePolicy = s.meal_allowance_policy || cs?.meal_allowance_policy || 'disabled';
  const showDailyAllowance =
    s.meal_allowance_policy === 'daily_allowance' ||
    s.meal_allowance_policy === 'both' ||
    (!s.meal_allowance_policy &&
      (cs?.meal_allowance_policy === 'daily_allowance' || cs?.meal_allowance_policy === 'both'));
  const showMealVouchers =
    s.meal_allowance_policy === 'meal_vouchers_only' ||
    s.meal_allowance_policy === 'both' ||
    (!s.meal_allowance_policy &&
      (cs?.meal_allowance_policy === 'meal_vouchers_only' || cs?.meal_allowance_policy === 'both'));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Buoni Pasto e Indennità Giornaliera</CardTitle>
          <CardDescription>
            Politica unificata per buoni pasto o indennità giornaliera (mutuamente esclusivi)
            {companySettings && ` (Aziendale: ${cs?.meal_allowance_policy || 'disabled'})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Politica Buoni Pasto / Indennità</Label>
              <Select
                value={s.meal_allowance_policy || 'company_default'}
                onValueChange={(value) => {
                  const newPolicy = value === 'company_default' ? null : value;
                  updateSetting('meal_allowance_policy', newPolicy);
                  if (newPolicy === 'disabled') {
                    updateSetting('meal_voucher_enabled', false);
                  } else if (newPolicy === 'meal_vouchers_only' || newPolicy === 'both') {
                    updateSetting('meal_voucher_enabled', true);
                  } else if (newPolicy === 'daily_allowance') {
                    updateSetting('meal_voucher_enabled', false);
                  } else {
                    updateSetting('meal_voucher_enabled', null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      companySettings
                        ? `Default: ${cs?.meal_allowance_policy || 'disabled'}`
                        : 'Seleziona politica'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company_default">Usa Default Aziendale</SelectItem>
                  <SelectItem value="disabled">Tutto disabilitato</SelectItem>
                  <SelectItem value="meal_vouchers_only">Solo buoni pasto</SelectItem>
                  <SelectItem value="daily_allowance">Indennità giornaliera</SelectItem>
                  <SelectItem value="both">Buoni pasto e indennità</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Valore effettivo: {getEffectiveValue(s.meal_allowance_policy, cs?.meal_allowance_policy || 'disabled')}
              </p>
            </div>

            {showDailyAllowance && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/20">
                <div>
                  <Label htmlFor="daily_allowance_amount">
                    Importo indennità giornaliera (€)<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="daily_allowance_amount"
                    type="number"
                    step="0.01"
                    value={settings.daily_allowance_amount || ''}
                    onChange={(e) =>
                      updateSetting(
                        'daily_allowance_amount',
                        e.target.value ? parseFloat(e.target.value) : null,
                      )
                    }
                    placeholder={`Default: €${cs?.default_daily_allowance_amount || 10.0}`}
                    className="mt-1"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valore effettivo: €
                    {settings.daily_allowance_amount || cs?.default_daily_allowance_amount || 10.0}
                  </p>
                </div>
                <div>
                  <Label htmlFor="daily_allowance_min_hours">
                    Ore minime per indennità<span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="daily_allowance_min_hours"
                    type="number"
                    step="0.01"
                    min="1"
                    value={settings.daily_allowance_min_hours || ''}
                    onChange={(e) =>
                      updateSetting(
                        'daily_allowance_min_hours',
                        e.target.value ? parseFloat(e.target.value) : null,
                      )
                    }
                    placeholder={`Default: ${cs?.default_daily_allowance_min_hours || 6}`}
                    className="mt-1"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valore effettivo:{' '}
                    {settings.daily_allowance_min_hours || cs?.default_daily_allowance_min_hours || 6} ore
                  </p>
                </div>
              </div>
            )}

            {showMealVouchers && (
              <div className="p-4 border rounded-lg bg-muted/20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="meal_voucher_amount">Importo buono pasto (€)</Label>
                    <Input
                      id="meal_voucher_amount"
                      type="number"
                      step="0.01"
                      value={settings.meal_voucher_amount || ''}
                      onChange={(e) =>
                        updateSetting(
                          'meal_voucher_amount',
                          e.target.value ? parseFloat(e.target.value) : null,
                        )
                      }
                      placeholder={`Default: €${companySettings?.meal_voucher_amount || 8.0}`}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Valore effettivo: €
                      {settings.meal_voucher_amount || companySettings?.meal_voucher_amount || 8.0}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="meal_voucher_min_hours">Ore minime per buoni pasto</Label>
                    <Input
                      id="meal_voucher_min_hours"
                      type="number"
                      step="0.01"
                      min="1"
                      max="24"
                      value={String(s.meal_voucher_min_hours || cs?.meal_voucher_min_hours || 6)}
                      onChange={(e) =>
                        updateSetting('meal_voucher_min_hours', parseFloat(e.target.value) || 6)
                      }
                      className="mt-1"
                      placeholder="6"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Valore effettivo: {s.meal_voucher_min_hours || cs?.meal_voucher_min_hours || 6} ore
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Meal allowance in paycheck */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coffee className="h-5 w-5" />
            Indennità di Mensa in Busta
          </CardTitle>
          <CardDescription>
            Se abilitato, il dipendente ha l'indennità di mensa in busta paga. Questo comporta l'utilizzo
            del massimale trasferta ridotto (€30.98) per tutti i giorni lavorati, come se avesse i buoni
            pasto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="has_meal_allowance_in_paycheck"
              checked={settings.has_meal_allowance_in_paycheck === true}
              onCheckedChange={(checked) => {
                updateSetting('has_meal_allowance_in_paycheck', checked === true);
              }}
            />
            <Label htmlFor="has_meal_allowance_in_paycheck" className="cursor-pointer">
              Dipendente con indennità di mensa in busta
            </Label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Valore attuale: {settings.has_meal_allowance_in_paycheck ? '✅ Abilitato' : '❌ Disabilitato'}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
