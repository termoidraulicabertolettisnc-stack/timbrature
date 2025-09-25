import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { ExcelImportService, ParsedTimesheet, ImportResult } from '@/services/ExcelImportService';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TimesheetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function TimesheetImportDialog({ open, onOpenChange, onImportComplete }: TimesheetImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseResult, setParseResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          selectedFile.name.endsWith('.xlsx')) {
        setFile(selectedFile);
        setParseResult(null);
        setStep('upload');
      } else {
        toast({
          title: "Errore",
          description: "Seleziona un file Excel (.xlsx)",
          variant: "destructive"
        });
      }
    }
  };

  const handleParse = async () => {
    if (!file) return;

    setParsing(true);
    try {
      const result = await ExcelImportService.parseExcelFile(file);
      setParseResult(result);
      setStep('preview');
    } catch (error) {
      toast({
        title: "Errore",
        description: "Errore durante l'analisi del file",
        variant: "destructive"
      });
    } finally {
      setParsing(false);
    }
  };

  const getMyCompany = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();
    return data?.company_id;
  };

  const findEmployeeByFiscalCode = async (fiscalCode: string, employeeName: string) => {
    const companyId = await getMyCompany();
    const cf = (fiscalCode || '').trim().toUpperCase();

    // First try to find by fiscal code within the same company
    const { data: fiscalData, error: fiscalError } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, company_id')
      .eq('company_id', companyId)
      .eq('codice_fiscale', cf)
      .maybeSingle();

    if (!fiscalError && fiscalData) {
      return fiscalData;
    }
    
    // If there was an error (not just no data), don't proceed to name fallback
    if (fiscalError) {
      return null;
    }

    // If fiscal code not found, try to find by name within the same company
    const nameParts = employeeName.trim().split(/\s+/);
    if (nameParts.length < 2) {
      return null;
    }

    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    const { data: nameData, error: nameError } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, company_id')
      .eq('company_id', companyId)
      .ilike('first_name', firstName)
      .ilike('last_name', lastName)
      .maybeSingle();

    return (!nameError && nameData) ? nameData : null;
  };


  const handleImport = async () => {
    if (!parseResult || parseResult.success.length === 0) return;

    setImporting(true);
    setStep('importing');
    setProgress(0);

    const importResults = {
      imported: 0,
      skipped: 0,
      errors: 0
    };

    try {
      const total = parseResult.success.length;
      const currentUserId = (await supabase.auth.getUser()).data.user?.id;

      for (let i = 0; i < parseResult.success.length; i++) {
        const timesheet = parseResult.success[i];
        
        try {
          // Find employee by fiscal code or name
          const employee = await findEmployeeByFiscalCode(timesheet.codice_fiscale, timesheet.employee_name);
          
          if (!employee) {
            console.warn(`Dipendente non trovato per codice fiscale: ${timesheet.codice_fiscale}`);
            importResults.errors++;
            continue;
          }

          // Handle timesheets with multiple sessions
          if (timesheet.sessions && timesheet.sessions.length > 0) {
            console.log(`Creating timesheet with ${timesheet.sessions.length} sessions`);
            
            // Create main timesheet first
            const { data: upsertedTimesheet, error: timesheetError } = await supabase
              .from('timesheets')
              .upsert({
                user_id: employee.user_id,
                date: timesheet.date,
                start_time: timesheet.start_time,
                end_time: timesheet.end_time,
                created_by: currentUserId,
                notes: `Importato da Excel - ${file?.name} (${timesheet.sessions.length} sessioni)`,
              }, { 
                onConflict: 'user_id,date', 
                ignoreDuplicates: false 
              })
              .select();

            if (timesheetError || !upsertedTimesheet?.[0]) {
              console.error('Error creating main timesheet:', timesheetError);
              importResults.errors++;
              continue;
            }

            const timesheetId = upsertedTimesheet[0].id;
            
            // Delete existing sessions to recreate them
            await supabase
              .from('timesheet_sessions')
              .delete()
              .eq('timesheet_id', timesheetId);
            
            // Create all sessions
            const sessionsToInsert = timesheet.sessions.map(session => ({
              timesheet_id: timesheetId,
              session_order: session.session_order,
              session_type: session.session_type,
              start_time: session.start_time,
              end_time: session.end_time,
              start_location_lat: session.start_location_lat,
              start_location_lng: session.start_location_lng,
              end_location_lat: session.end_location_lat,
              end_location_lng: session.end_location_lng,
              notes: `Sessione ${session.session_order} importata da Excel`
            }));

            const { error: sessionsError } = await supabase
              .from('timesheet_sessions')
              .insert(sessionsToInsert);

            if (sessionsError) {
              console.error('Error creating sessions:', sessionsError);
              importResults.errors++;
              continue;
            }

            console.log(`Successfully imported timesheet ${timesheetId} with ${timesheet.sessions.length} sessions`);
            
          } else {
            // Handle simple timesheets without sessions
            const { error } = await supabase.from('timesheets').upsert({
              user_id: employee.user_id,
              date: timesheet.date,
              start_time: timesheet.start_time,
              end_time: timesheet.end_time,
              start_location_lat: timesheet.start_location_lat,
              start_location_lng: timesheet.start_location_lng,
              end_location_lat: timesheet.end_location_lat,
              end_location_lng: timesheet.end_location_lng,
              lunch_start_time: timesheet.lunch_start_time,
              lunch_end_time: timesheet.lunch_end_time,
              created_by: currentUserId,
              notes: `Importato da Excel - ${file?.name}`,
              total_hours: timesheet.total_hours
            }, { 
              onConflict: 'user_id,date', 
              ignoreDuplicates: false 
            });

            if (error) {
              console.error('Error importing single timesheet:', error);
              importResults.errors++;
              continue;
            }
          }
          
          importResults.imported++;
          
        } catch (error) {
          console.error('Error during import:', error);
          importResults.errors++;
        } finally {
          setProgress(((i + 1) / total) * 100);
        }
      }

      setProgress(100);
      setStep('complete');

      toast({
        title: "Importazione completata",
        description: `Importate: ${importResults.imported}, Saltate: ${importResults.skipped}, Errori: ${importResults.errors}`,
      });

      onImportComplete();

    } catch (error) {
      console.error('General error during import:', error);
      toast({
        title: "Errore",
        description: "Errore durante l'importazione",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParseResult(null);
    setStep('upload');
    setProgress(0);
    onOpenChange(false);
  };

  const renderUploadStep = () => (
    <div className="space-y-4">
      <div className="text-center">
        <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-lg font-medium">Importa Timbrature da Excel</h3>
        <p className="text-sm text-muted-foreground">
          Carica un file Excel con le timbrature dei dipendenti
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file">Seleziona file Excel (.xlsx)</Label>
        <Input
          id="file"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
        />
      </div>

      {file && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span className="text-sm font-medium">{file.name}</span>
              <Badge variant="outline">{(file.size / 1024 / 1024).toFixed(2)} MB</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex space-x-2">
        <Button variant="outline" onClick={handleClose} className="flex-1">
          Annulla
        </Button>
        <Button 
          onClick={handleParse} 
          disabled={!file || parsing}
          className="flex-1"
        >
          {parsing ? 'Analisi...' : 'Analizza File'}
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    if (!parseResult) return null;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center">
                <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
                Da Importare
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{parseResult.success.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1 text-yellow-500" />
                Errori
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{parseResult.errors.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center">
                <Users className="h-4 w-4 mr-1 text-blue-500" />
                Dipendenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {new Set(parseResult.success.map(t => t.codice_fiscale)).size}
              </p>
            </CardContent>
          </Card>
        </div>

        {parseResult.errors.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Sono stati trovati {parseResult.errors.length} errori che impediranno l'importazione di alcune righe.
            </AlertDescription>
          </Alert>
        )}

        <div className="max-h-40 overflow-y-auto">
          <h4 className="text-sm font-medium mb-2">Anteprima timbrature da importare:</h4>
          <div className="space-y-2">
            {parseResult.success.slice(0, 10).map((timesheet, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                <span>{timesheet.employee_name}</span>
                <span>{timesheet.date}</span>
                <span>{timesheet.total_hours}h</span>
              </div>
            ))}
            {parseResult.success.length > 10 && (
              <p className="text-xs text-muted-foreground">
                ... e altri {parseResult.success.length - 10} record
              </p>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">
            Indietro
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={parseResult.success.length === 0}
            className="flex-1"
          >
            Importa {parseResult.success.length} Timbrature
          </Button>
        </div>
      </div>
    );
  };

  const renderImportingStep = () => (
    <div className="space-y-4 text-center">
      <Clock className="mx-auto h-12 w-12 text-blue-500" />
      <h3 className="text-lg font-medium">Importazione in corso...</h3>
      <Progress value={progress} className="w-full" />
      <p className="text-sm text-muted-foreground">
        {Math.round(progress)}% completato
      </p>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-4 text-center">
      <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
      <h3 className="text-lg font-medium">Importazione completata!</h3>
      <p className="text-sm text-muted-foreground">
        Le timbrature sono state importate con successo
      </p>
      <Button onClick={handleClose} className="w-full">
        Chiudi
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importa Timbrature Excel</DialogTitle>
        </DialogHeader>
        
        {step === 'upload' && renderUploadStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'complete' && renderCompleteStep()}
      </DialogContent>
    </Dialog>
  );
}