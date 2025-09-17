import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calculator, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import type { OvertimeConversionCalculation } from '@/types/overtime-conversion';

interface OvertimeConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  month: string;
  originalOvertimeHours?: number;
  onSuccess?: () => void;
}

export function OvertimeConversionDialog({
  open,
  onOpenChange,
  userId,
  userName,
  month,
  originalOvertimeHours = 0,
  onSuccess
}: OvertimeConversionDialogProps) {
  const [manualHours, setManualHours] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculation, setCalculation] = useState<OvertimeConversionCalculation | null>(null);

  useEffect(() => {
    if (open && userId && month) {
      loadCurrentCalculation();
    }
  }, [open, userId, month]);

  const loadCurrentCalculation = async () => {
    console.log(`🔍 [OvertimeConversionDialog] Caricamento calcolo per utente ${userId}, mese ${month}`, {
      originalOvertimeHours
    });
    
    try {
      const calc = await OvertimeConversionService.calculateConversionDetails(
        userId,
        month,
        originalOvertimeHours
      );
      console.log(`📊 [OvertimeConversionDialog] Calcolo caricato:`, calc);
      setCalculation(calc);
    } catch (error) {
      console.error('❌ [OvertimeConversionDialog] Errore caricamento calcolo:', error);
    }
  };

  const handleSave = async () => {
    if (!userId || !month) return;

    const hours = parseFloat(manualHours) || 0;
    
    console.log(`💾 [OvertimeConversionDialog] Tentativo salvataggio:`, {
      userId,
      month,
      hours,
      calculation
    });
    
    // Verifica che non si stia tentando di de-convertire più ore di quelle convertite
    if (calculation && hours < 0 && Math.abs(hours) > calculation.converted_hours) {
      const errorMsg = `Non puoi de-convertire più di ${calculation.converted_hours.toFixed(2)} ore già convertite`;
      console.error(`❌ [OvertimeConversionDialog] ${errorMsg}`);
      toast.error(errorMsg);
      return;
    }

    setLoading(true);
    try {
      const success = await OvertimeConversionService.applyManualConversion(
        userId,
        month,
        hours,
        notes || undefined
      );

      if (success) {
        console.log(`✅ [OvertimeConversionDialog] Conversione salvata con successo`);
        toast.success('Conversione straordinari salvata con successo');
        onSuccess?.();
        onOpenChange(false);
        resetForm();
      } else {
        console.error(`❌ [OvertimeConversionDialog] Errore salvataggio conversione`);
        toast.error('Errore nel salvataggio della conversione');
      }
    } catch (error) {
      console.error('❌ [OvertimeConversionDialog] Errore salvataggio conversione:', error);
      toast.error('Errore nel salvataggio della conversione');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    console.log(`🔄 [OvertimeConversionDialog] Reset form`);
    setManualHours('');
    setNotes('');
    setCalculation(null);
  };

  const handleClose = () => {
    console.log(`❌ [OvertimeConversionDialog] Chiusura dialog`);
    onOpenChange(false);
    resetForm();
  };

  const previewHours = parseFloat(manualHours) || 0;
  const previewAmount = calculation ? previewHours * calculation.conversion_rate : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Conversione Straordinari
          </DialogTitle>
          <DialogDescription>
            Converti manualmente ore straordinari in trasferte per {userName} - {month}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {calculation && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Straordinari originali:</span>
                <span className="font-mono">{calculation.original_overtime_hours.toFixed(2)}h</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Già convertiti:</span>
                <span className="font-mono">{calculation.converted_hours.toFixed(2)}h</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>Straordinari rimanenti:</span>
                <span className="font-mono">{calculation.remaining_overtime_hours.toFixed(2)}h</span>
              </div>
              {calculation.converted_hours > 0 && (
                <div className="text-xs text-muted-foreground">
                  {calculation.explanation}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="manual_hours">Ore da convertire (+) o de-convertire (-)</Label>
            <Input
              id="manual_hours"
              type="number"
              step="0.5"
              value={manualHours}
              onChange={(e) => setManualHours(e.target.value)}
              placeholder="0"
            />
            {previewHours !== 0 && calculation && (
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Calculator className="h-3 w-3" />
                {previewHours > 0 ? 'Conversione' : 'De-conversione'}: {Math.abs(previewHours)}h × {calculation.conversion_rate}€/h = {previewAmount.toFixed(2)}€
              </div>
            )}
            {calculation && calculation.converted_hours > 0 && (
              <div className="text-xs text-muted-foreground">
                Usa valori negativi per de-convertire ore già convertite
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note (opzionale)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo della conversione..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salva Conversione'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}