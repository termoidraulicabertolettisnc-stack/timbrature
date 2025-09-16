import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, PlayIcon, CheckCircleIcon, AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ProcessingResult {
  month: string;
  processed: number;
  errors: string[];
  status: 'idle' | 'processing' | 'completed' | 'error';
}

const OvertimeConversionProcessor: React.FC = () => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ProcessingResult[]>([]);

  const processMonth = async (month: string) => {
    if (!user) return;

    setProcessing(true);
    
    // Get user's company
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.company_id) {
      toast.error('Impossibile determinare l\'azienda dell\'utente');
      setProcessing(false);
      return;
    }

    // Update results to show processing
    setResults(prev => [
      { month, processed: 0, errors: [], status: 'processing' },
      ...prev.filter(r => r.month !== month)
    ]);

    try {
      const result = await OvertimeConversionService.processAutomaticConversions(
        month, 
        profile.company_id
      );

      // Update results
      setResults(prev => [
        { 
          month, 
          processed: result.processed, 
          errors: result.errors, 
          status: result.errors.length > 0 ? 'error' : 'completed' 
        },
        ...prev.filter(r => r.month !== month)
      ]);

      if (result.processed > 0) {
        toast.success(`✅ Processate ${result.processed} conversioni per ${month}`);
      } else {
        toast.info(`ℹ️ Nessuna conversione da processare per ${month}`);
      }

      if (result.errors.length > 0) {
        toast.error(`⚠️ ${result.errors.length} errori durante il processamento`);
      }

    } catch (error) {
      console.error('Error processing month:', error);
      setResults(prev => [
        { 
          month, 
          processed: 0, 
          errors: [`Errore di sistema: ${error}`], 
          status: 'error' 
        },
        ...prev.filter(r => r.month !== month)
      ]);
      toast.error('Errore durante il processamento');
    } finally {
      setProcessing(false);
    }
  };

  const getMonthName = (month: string) => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  };

  const getStatusBadge = (result: ProcessingResult) => {
    switch (result.status) {
      case 'processing':
        return <Badge variant="secondary">Elaborando...</Badge>;
      case 'completed':
        return <Badge variant="default">✅ Completato</Badge>;
      case 'error':
        return <Badge variant="destructive">⚠️ Errori</Badge>;
      default:
        return <Badge variant="outline">In attesa</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Processamento Conversioni Straordinari
        </CardTitle>
        <CardDescription>
          Applica automaticamente le conversioni straordinari per i mesi selezionati.
          Questo processo calcola e salva le conversioni automatiche per tutti i dipendenti che superano il limite mensile impostato.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Seleziona Mese</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const date = new Date();
                  date.setMonth(date.getMonth() - i);
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  return (
                    <SelectItem key={value} value={value}>
                      {getMonthName(value)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={() => processMonth(selectedMonth)}
            disabled={processing}
            className="flex items-center gap-2"
          >
            <PlayIcon className="h-4 w-4" />
            {processing ? 'Elaborando...' : 'Processa Mese'}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Risultati Processamento</h3>
            {results.map((result) => (
              <Card key={result.month} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{getMonthName(result.month)}</span>
                    {getStatusBadge(result)}
                  </div>
                  {result.processed > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {result.processed} conversioni processate
                    </span>
                  )}
                </div>
                
                {result.errors.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-destructive flex items-center gap-1">
                      <AlertCircleIcon className="h-4 w-4" />
                      Errori:
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {result.errors.map((error, index) => (
                        <li key={index} className="pl-4 border-l-2 border-destructive">
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6 p-4 bg-muted rounded-lg">
          <h3 className="font-medium mb-2">ℹ️ Come funziona</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Il sistema calcola le ore straordinari totali per ogni dipendente nel mese selezionato</li>
            <li>• Se le ore superano il limite mensile impostato, la differenza viene convertita automaticamente</li>
            <li>• Le conversioni automatiche vengono salvate nel database e mostrate nel Dashboard Trasferte</li>
            <li>• Le conversioni manuali esistenti vengono preserve e sommate a quelle automatiche</li>
            <li>• Il processo può essere eseguito più volte senza problemi (sovrascrive le conversioni automatiche precedenti)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default OvertimeConversionProcessor;