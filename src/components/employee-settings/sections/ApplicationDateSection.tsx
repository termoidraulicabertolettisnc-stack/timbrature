import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertTriangle, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ApplicationType } from '../types';

interface ApplicationDateSectionProps {
  applicationType: ApplicationType;
  setApplicationType: (t: ApplicationType) => void;
  selectedDate: Date | undefined;
  setSelectedDate: (d: Date | undefined) => void;
}

export function ApplicationDateSection({
  applicationType,
  setApplicationType,
  selectedDate,
  setSelectedDate,
}: ApplicationDateSectionProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Data di Applicazione Modifiche
        </CardTitle>
        <CardDescription>Scegli quando le modifiche alle impostazioni entreranno in vigore</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <RadioGroup
            value={applicationType}
            onValueChange={(value: ApplicationType) => setApplicationType(value)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="from_today" id="from_today" />
              <Label htmlFor="from_today" className="cursor-pointer">
                <div>
                  <div className="font-medium">Applica da oggi</div>
                  <div className="text-sm text-muted-foreground">
                    Le modifiche si applicano da oggi in avanti. I calcoli passati rimangono invariati.
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="from_date" id="from_date" />
              <Label htmlFor="from_date" className="cursor-pointer">
                <div>
                  <div className="font-medium">Applica da data specifica</div>
                  <div className="text-sm text-muted-foreground">
                    Le modifiche si applicano dalla data selezionata in avanti.
                  </div>
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <RadioGroupItem value="retroactive" id="retroactive" />
              <Label htmlFor="retroactive" className="cursor-pointer">
                <div>
                  <div className="font-medium text-orange-700">Modifica retroattiva totale</div>
                  <div className="text-sm text-orange-600">
                    ⚠️ Le modifiche si applicano a tutto lo storico. Tutti i calcoli passati verranno aggiornati.
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {applicationType === 'from_date' && (
            <div className="ml-6 mt-4">
              <Label>Seleziona la data di inizio</Label>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal mt-2',
                      !selectedDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'dd MMMM yyyy', { locale: it }) : 'Seleziona una data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {applicationType === 'retroactive' && (
            <Alert className="bg-orange-100 border-orange-300">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Attenzione:</strong> La modifica retroattiva aggiornerà tutti i calcoli esistenti per
                questo dipendente. Questa operazione potrebbe richiedere alcuni minuti e influenzerà report e
                export già generati.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
