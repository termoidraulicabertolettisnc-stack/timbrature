import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface DebugResult {
  timesheet_date: string;
  user_name: string;
  user_id_check: string;
  employee_settings_found: boolean;
  employee_lunch_type: string;
  employee_valid_from: string;
  employee_valid_to: string;
  company_lunch_type: string;
  calculated_lunch_minutes: number;
  lunch_overlap_seconds: number;
  hours_worked_without_lunch: number;
  final_total_hours: number;
  debug_branch: string;
  exact_employee_query_result: string;
}

export const TimesheetDebugPanel = () => {
  const [timesheetId, setTimesheetId] = useState('ea747701-c171-47e5-9304-90b72568566f');
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const runDebug = async () => {
    if (!timesheetId) {
      toast({
        title: "Errore",
        description: "Inserisci un ID timesheet",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('debug_timesheet_lunch_calculation_v2', {
        p_timesheet_id: timesheetId
      });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setDebugResult(data[0]);
      } else {
        setDebugResult(null);
        toast({
          title: "Nessun risultato",
          description: "Timesheet non trovato",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Debug error:', error);
      toast({
        title: "Errore",
        description: "Errore durante il debug",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const forceRecalculation = async () => {
    if (!timesheetId) return;

    setLoading(true);
    try {
      // Force recalculation by updating the timesheet
      const { error } = await supabase
        .from('timesheets')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', timesheetId);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Ricalcolo forzato completato",
      });
      
      // Run debug again to see new results
      setTimeout(() => runDebug(), 1000);
    } catch (error) {
      console.error('Recalculation error:', error);
      toast({
        title: "Errore",
        description: "Errore durante il ricalcolo",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
      <h3 className="text-lg font-semibold">Debug Timesheet Lunch Calculation</h3>
      
      <div className="flex gap-2">
        <Input
          placeholder="Timesheet ID"
          value={timesheetId}
          onChange={(e) => setTimesheetId(e.target.value)}
          className="flex-1"
        />
        <Button onClick={runDebug} disabled={loading}>
          Debug
        </Button>
        <Button onClick={forceRecalculation} disabled={loading} variant="secondary">
          Forza Ricalcolo
        </Button>
      </div>

      {debugResult && (
        <Card className="p-4">
          <div className="space-y-2 text-sm">
            <div><strong>Utente:</strong> {debugResult.user_name}</div>
            <div><strong>Data:</strong> {debugResult.timesheet_date}</div>
            <div><strong>User ID:</strong> {debugResult.user_id_check}</div>
            
            <div className="border-t pt-2 mt-2">
              <div className={`font-medium ${debugResult.employee_settings_found ? 'text-green-600' : 'text-red-600'}`}>
                <strong>Impostazioni Dipendente Trovate:</strong> {debugResult.employee_settings_found ? 'SÌ' : 'NO'}
              </div>
              <div><strong>Tipo Pausa Dipendente:</strong> {debugResult.employee_lunch_type}</div>
              <div><strong>Valido Dal:</strong> {debugResult.employee_valid_from}</div>
              <div><strong>Valido Fino A:</strong> {debugResult.employee_valid_to || 'NULL'}</div>
              <div><strong>Query Result:</strong> {debugResult.exact_employee_query_result}</div>
            </div>
            
            <div className="border-t pt-2 mt-2">
              <div><strong>Tipo Pausa Azienda:</strong> {debugResult.company_lunch_type}</div>
              <div className={`font-medium ${debugResult.calculated_lunch_minutes === 30 ? 'text-green-600' : 'text-red-600'}`}>
                <strong>Minuti Pausa Calcolati:</strong> {debugResult.calculated_lunch_minutes} min
              </div>
              <div><strong>Branch Usato:</strong> {debugResult.debug_branch}</div>
            </div>
            
            <div className="border-t pt-2 mt-2">
              <div><strong>Ore Lavorate (senza pausa):</strong> {debugResult.hours_worked_without_lunch.toFixed(2)} h</div>
              <div><strong>Secondi Pausa Applicati:</strong> {debugResult.lunch_overlap_seconds} s</div>
              <div className={`font-medium ${debugResult.final_total_hours > 11 ? 'text-green-600' : 'text-red-600'}`}>
                <strong>Ore Totali Finali:</strong> {debugResult.final_total_hours} h
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};