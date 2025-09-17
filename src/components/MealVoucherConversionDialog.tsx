import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign, Receipt, Users } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { MealVoucherConversionService, MealVoucherConversion } from '@/services/MealVoucherConversionService';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface MealVoucherConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  date: string;
  companyId: string;
  onConversionUpdated?: () => void;
}

export function MealVoucherConversionDialog({
  open,
  onOpenChange,
  userId,
  userName,
  date,
  companyId,
  onConversionUpdated
}: MealVoucherConversionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [convertedToAllowance, setConvertedToAllowance] = useState(false);
  const [notes, setNotes] = useState('');
  const [existingConversion, setExistingConversion] = useState<MealVoucherConversion | null>(null);

  useEffect(() => {
    if (open && userId && date) {
      loadExistingConversion();
    }
  }, [open, userId, date]);

  const loadExistingConversion = async () => {
    try {
      const conversion = await MealVoucherConversionService.getConversionForDate(userId, date);
      if (conversion) {
        setExistingConversion(conversion);
        setConvertedToAllowance(conversion.converted_to_allowance);
        setNotes(conversion.notes || '');
      } else {
        setExistingConversion(null);
        setConvertedToAllowance(false);
        setNotes('');
      }
    } catch (error) {
      console.error('Error loading conversion:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dello stato conversione",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!userId || !date || !companyId) return;

    setLoading(true);
    try {
      await MealVoucherConversionService.toggleConversion({
        user_id: userId,
        company_id: companyId,
        date: date,
        converted_to_allowance: convertedToAllowance,
        notes: notes.trim() || undefined
      });

      toast({
        title: "Conversione aggiornata",
        description: convertedToAllowance 
          ? "Buono pasto convertito in indennità giornaliera"
          : "Conversione rimossa - ripristinato buono pasto",
      });

      onConversionUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving conversion:', error);
      toast({
        title: "Errore",
        description: "Errore nel salvare la conversione",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!userId || !date || !existingConversion) return;

    setLoading(true);
    try {
      await MealVoucherConversionService.deleteConversion(userId, date);

      toast({
        title: "Conversione eliminata",
        description: "Stato ripristinato alle impostazioni predefinite",
      });

      onConversionUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting conversion:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminare la conversione",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString + 'T00:00:00'), 'PPPP', { locale: it });
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Conversione Buono Pasto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info Header */}
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              <span className="font-medium">{userName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(date)}</span>
            </div>
          </div>

          {/* Conversion Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="conversion-switch" className="text-base font-medium">
                  Converti in Indennità Giornaliera
                </Label>
                <p className="text-sm text-muted-foreground">
                  {convertedToAllowance 
                    ? "Il buono pasto sarà convertito in indennità giornaliera (€46.48 per trasferte)"
                    : "Il dipendente riceverà il buono pasto normale (€30.98 per trasferte)"
                  }
                </p>
              </div>
              <Switch
                id="conversion-switch"
                checked={convertedToAllowance}
                onCheckedChange={setConvertedToAllowance}
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={convertedToAllowance ? "default" : "outline"} className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {convertedToAllowance ? "Indennità" : "Buono Pasto"}
              </Badge>
              {convertedToAllowance && (
                <Badge variant="secondary">
                  Tasso Trasferta: €46.48
                </Badge>
              )}
              {!convertedToAllowance && (
                <Badge variant="secondary">
                  Tasso Trasferta: €30.98
                </Badge>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note (opzionale)</Label>
            <Textarea
              id="notes"
              placeholder="Aggiungi una nota per spiegare la conversione..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Existing conversion info */}
          {existingConversion && (
            <div className="text-xs text-muted-foreground p-3 bg-muted/50 rounded">
              <p>Conversione esistente dal {format(new Date(existingConversion.created_at), 'dd/MM/yyyy HH:mm')}</p>
              {existingConversion.notes && (
                <p className="mt-1">Note: {existingConversion.notes}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {existingConversion && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={loading}
            >
              Elimina Conversione
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? "Salvando..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
