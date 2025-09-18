import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MealVoucherConversionService } from '@/services/MealVoucherConversionService';

interface MassConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  companyId: string;
  month: string; // Format: YYYY-MM
  workingDays: string[]; // Array of dates with working hours
  onConversionUpdated?: () => void;
}

export function MassConversionDialog({
  open,
  onOpenChange,
  userId,
  userName,
  companyId,
  month,
  workingDays,
  onConversionUpdated
}: MassConversionDialogProps) {
  const [convertAllToAllowance, setConvertAllToAllowance] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentConversions, setCurrentConversions] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadCurrentConversions();
    }
  }, [open, userId, month]);

  const loadCurrentConversions = async () => {
    try {
      const [year, monthStr] = month.split('-');
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${new Date(parseInt(year), parseInt(monthStr), 0).getDate()}`;
      
      const conversions = await MealVoucherConversionService.getConversions(userId, startDate, endDate);
      const convertedDates = conversions
        .filter(conv => conv.converted_to_allowance)
        .map(conv => conv.date);
      
      setCurrentConversions(convertedDates);
      setConvertAllToAllowance(convertedDates.length === workingDays.length);
    } catch (error) {
      console.error('Error loading conversions:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const date of workingDays) {
        try {
          const isCurrentlyConverted = currentConversions.includes(date);
          
          if (convertAllToAllowance && !isCurrentlyConverted) {
            // Convert to allowance
            await MealVoucherConversionService.toggleConversion({
              user_id: userId,
              date,
              company_id: companyId,
              converted_to_allowance: true,
              notes: notes || `Conversione massiva - ${month}`,
            });
            successCount++;
          } else if (!convertAllToAllowance && isCurrentlyConverted) {
            // Remove conversion
            await MealVoucherConversionService.deleteConversion(userId, date);
            successCount++;
          }
        } catch (error) {
          console.error(`Error processing date ${date}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Conversioni aggiornate',
          description: `${successCount} giorni aggiornati con successo${errorCount > 0 ? `, ${errorCount} errori` : ''}`,
        });
      }

      if (onConversionUpdated) {
        onConversionUpdated();
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving mass conversion:', error);
      toast({
        title: 'Errore',
        description: 'Errore durante il salvataggio delle conversioni',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const affectedDaysCount = convertAllToAllowance 
    ? workingDays.length - currentConversions.length 
    : currentConversions.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conversione Massiva Buoni Pasto</DialogTitle>
          <DialogDescription>
            Gestisci la conversione di tutti i buoni pasto del mese per <strong>{userName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <strong>Mese:</strong> {new Date(month + '-01').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Giorni lavorativi:</strong> {workingDays.length}
            </div>
            <div className="text-sm text-muted-foreground">
              <strong>Attualmente convertiti:</strong> {currentConversions.length}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="convert-all"
              checked={convertAllToAllowance}
              onCheckedChange={setConvertAllToAllowance}
            />
            <Label htmlFor="convert-all">
              {convertAllToAllowance ? 'Converti tutti in indennità' : 'Rimuovi tutte le conversioni'}
            </Label>
          </div>

          {affectedDaysCount > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">
                {convertAllToAllowance ? 'Verranno convertiti' : 'Verranno rimossi'}: {affectedDaysCount} giorni
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={convertAllToAllowance ? 'default' : 'secondary'}>
                  {convertAllToAllowance ? 'Conversione in Indennità' : 'Rimozione Conversioni'}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  €{convertAllToAllowance ? '46.48' : '30.98'} per giorno
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Note (opzionale)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Aggiungi una nota per questa conversione massiva..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={loading || affectedDaysCount === 0}
          >
            {loading ? 'Salvando...' : `Aggiorna ${affectedDaysCount} giorni`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}