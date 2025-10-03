import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileSpreadsheet,
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  AlertTriangle,
  RefreshCw,
  FileDown,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// =====================================================
// TYPES & INTERFACES
// =====================================================
interface ImportRow {
  employee_code: string;
  date: string;
  start_time: string;
  end_time: string;
  pause_minutes?: number;
  notes?: string;
  site_code?: string;
  project_code?: string;
  source_row_index?: number;
}

interface ValidationResult {
  row_number: number;
  status: 'valid' | 'warning' | 'error';
  messages: Array<{
    type: 'error' | 'warning' | 'info';
    field: string;
    message: string;
  }>;
  data: ImportRow;
  employee_name?: string;
  calculated_hours?: number;
}

interface ImportStats {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
}

interface TimesheetImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

// =====================================================
// MAIN COMPONENT - AUTOMATIZZATO PER BERTOLETTI
// =====================================================
export function TimesheetImportDialog({
  open,
  onOpenChange,
  onImportComplete
}: TimesheetImportDialogProps) {
  const { toast } = useToast();
  
  // State management
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [mappedData, setMappedData] = useState<ImportRow[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importMode, setImportMode] = useState<'all_or_nothing' | 'partial'>('all_or_nothing');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats>({ total: 0, valid: 0, warnings: 0, errors: 0 });

  // =====================================================
  // FILE HANDLING - AUTOMATIZZATO
  // =====================================================
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Processo automatico diretto
      processExcelFile(selectedFile);
    }
  };

  const processExcelFile = async (file: File) => {
    try {
      setLoading(true);
      
      toast({
        title: "⚡ Elaborazione automatica",
        description: "Riconoscimento formato Bertoletti in corso...",
      });

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { 
        type: 'array',
        cellDates: true,
        dateNF: 'yyyy-mm-dd hh:mm:ss'
      });
      
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        throw new Error('File vuoto');
      }

      // MAPPATURA AUTOMATICA PER FILE BERTOLETTI
      const mappedData = jsonData.map((row: any, index) => {
        // Estrai data e ore dal formato Bertoletti
        let date = '';
        let start_time = '';
        let end_time = '';
        
        // Gestione "Data ingresso" (formato: "2025-08-01 07:17:51")
        const dataIngresso = row['Data ingresso'] || row['data ingresso'];
        if (dataIngresso) {
          if (typeof dataIngresso === 'string' && dataIngresso.includes(' ')) {
            const [datePart, timePart] = dataIngresso.split(' ');
            date = datePart;
            start_time = timePart ? timePart.substring(0, 5) : '';
          } else if (dataIngresso instanceof Date) {
            date = format(dataIngresso, 'yyyy-MM-dd');
            start_time = format(dataIngresso, 'HH:mm');
          } else {
            date = dataIngresso.toString();
          }
        }
        
        // Gestione "Data uscita" (formato: "2025-08-01 12:37:13")
        const dataUscita = row['Data uscita'] || row['data uscita'];
        if (dataUscita) {
          if (typeof dataUscita === 'string' && dataUscita.includes(' ')) {
            const [, timePart] = dataUscita.split(' ');
            end_time = timePart ? timePart.substring(0, 5) : '';
          } else if (dataUscita instanceof Date) {
            end_time = format(dataUscita, 'HH:mm');
          } else {
            end_time = dataUscita.toString().substring(0, 5);
          }
        }
        
        // Codice fiscale
        const codiceFiscale = row['Codice fiscale'] || row['codice fiscale'] || row['CF'] || '';
        
        // Sede (se presente)
        const sede = row['Luogo di lavoro'] || row['Sede'] || '';
        
        return {
          employee_code: codiceFiscale.trim(),
          date: date,
          start_time: start_time,
          end_time: end_time,
          pause_minutes: undefined, // Gestito automaticamente dal sistema
          notes: row['Note'] || '',
          site_code: sede,
          project_code: row['Progetto'] || '',
          source_row_index: index + 2
        };
      }).filter((row: ImportRow) => row.employee_code && row.date && row.start_time && row.end_time);

      setMappedData(mappedData);
      
      // Vai direttamente alla validazione
      await validateData(mappedData);
      
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Errore",
        description: "Impossibile elaborare il file Excel",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  // =====================================================
  // VALIDATION - UGUALE MA AUTOMATICA
  // =====================================================
  const validateData = async (data: ImportRow[]) => {
    setLoading(true);
    setStep('preview');
    
    try {
      // Generate batch ID
      const newBatchId = crypto.randomUUID();
      setBatchId(newBatchId);
      
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      
      // Insert all rows into staging table
      const { error: insertError } = await supabase
        .from('import_staging')
        .insert(
          data.map((row, index) => ({
            batch_id: newBatchId,
            row_number: index + 1,
            ...row,
            imported_by: currentUserId
          }))
        );
      
      if (insertError) throw insertError;
      
      // Fetch validation results
      const { data: validationData, error: validationError } = await supabase
        .from('import_preview')
        .select('*')
        .eq('batch_id', newBatchId)
        .order('row_number');
      
      if (validationError) throw validationError;
      
      // Transform to ValidationResult format
      const results: ValidationResult[] = validationData.map((v: any) => ({
        row_number: v.row_number,
        status: v.validation_status,
        messages: v.validation_messages || [],
        data: {
          employee_code: v.employee_code,
          date: v.date,
          start_time: v.start_time,
          end_time: v.end_time,
          pause_minutes: v.pause_minutes,
          notes: v.notes,
          site_code: v.site_code,
          project_code: v.project_code,
          source_row_index: v.row_number + 1
        },
        employee_name: v.employee_name,
        calculated_hours: v.calculated_hours
      }));
      
      setValidationResults(results);
      
      // Calculate stats
      const newStats = {
        total: results.length,
        valid: results.filter(r => r.status === 'valid').length,
        warnings: results.filter(r => r.status === 'warning').length,
        errors: results.filter(r => r.status === 'error').length
      };
      setStats(newStats);
      
      // Notifica automatica
      if (newStats.errors === 0 && newStats.valid > 0) {
        toast({
          title: "✅ File pronto per l'import",
          description: `${newStats.valid} sessioni valide trovate`,
        });
      } else if (newStats.errors > 0) {
        toast({
          title: "⚠️ Attenzione",
          description: `Trovati ${newStats.errors} errori da correggere`,
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Errore validazione",
        description: "Impossibile validare i dati",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // IMPORT EXECUTION
  // =====================================================
  const executeImport = async () => {
    if (!batchId) return;
    
    setStep('importing');
    setLoading(true);
    setProgress(0);
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      
      // Simula progresso
      const interval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      // Call the process function
      const { data, error } = await supabase
        .rpc('process_import_batch', {
          p_batch_id: batchId,
          p_mode: importMode,
          p_user_id: currentUserId
        });
      
      clearInterval(interval);
      
      if (error) throw error;
      
      const result = data[0];
      
      setProgress(100);
      setStep('complete');
      
      toast({
        title: "🎉 Import completato!",
        description: `Importate ${result.success_count} sessioni con successo`,
      });
      
      if (onImportComplete) {
        onImportComplete();
      }
      
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Errore import",
        description: "Impossibile completare l'importazione",
        variant: "destructive"
      });
      setStep('preview'); // Torna alla preview in caso di errore
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================
  const downloadTemplate = () => {
    const template = [
      ['Codice fiscale', 'Data ingresso', 'Data uscita', 'Note'],
      ['RSSMRA80A01H501Z', '2025-01-15 08:00:00', '2025-01-15 12:00:00', 'Mattina'],
      ['RSSMRA80A01H501Z', '2025-01-15 13:00:00', '2025-01-15 17:00:00', 'Pomeriggio'],
      ['VRDGPP75B15H501X', '2025-01-15 07:30:00', '2025-01-15 16:00:00', 'Giornata completa']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_timbrature_bertoletti.xlsx');
  };

  const downloadErrors = () => {
    const errorRows = validationResults
      .filter(v => v.status === 'error' || v.status === 'warning')
      .map(v => ({
        'Riga': v.data.source_row_index,
        'Stato': v.status === 'error' ? 'ERRORE' : 'AVVISO',
        'Codice Fiscale': v.data.employee_code,
        'Data': v.data.date,
        'Entrata': v.data.start_time,
        'Uscita': v.data.end_time,
        'Messaggi': v.messages.map(m => m.message).join('; ')
      }));
    
    const ws = XLSX.utils.json_to_sheet(errorRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errori');
    XLSX.writeFile(wb, `errori_import_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
  };

  const resetImport = () => {
    setFile(null);
    setMappedData([]);
    setValidationResults([]);
    setBatchId(null);
    setProgress(0);
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
    setStep('upload');
  };

  // =====================================================
  // RENDER FUNCTIONS
  // =====================================================
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium">Import Automatico Timbrature</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Sistema ottimizzato per <strong>Termoidraulica Bertoletti</strong>
        </p>
        <Badge variant="outline" className="mt-2">
          Riconoscimento automatico colonne attivo
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-primary transition-colors">
          <Label htmlFor="file" className="cursor-pointer">
            <div className="flex flex-col items-center">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">Clicca per selezionare il file Excel</span>
              <span className="text-xs text-muted-foreground mt-1">o trascina qui il file</span>
            </div>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
          </Label>
        </div>

        <Button 
          onClick={downloadTemplate}
          variant="outline" 
          className="w-full"
        >
          <Download className="mr-2 h-4 w-4" />
          Scarica Template Bertoletti
        </Button>

        {file && (
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <Badge variant="outline" className="bg-white">
                  {(file.size / 1024).toFixed(1)} KB
                </Badge>
              </div>
              <p className="text-xs text-green-600 mt-2">
                Elaborazione automatica in corso...
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Anteprima Import</h3>
          <p className="text-sm text-muted-foreground">
            Rilevamento automatico formato Bertoletti completato
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={stats.errors > 0 ? "destructive" : "default"}>
            {stats.total} righe
          </Badge>
          {stats.valid > 0 && (
            <Badge variant="outline" className="border-green-500 text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              {stats.valid}
            </Badge>
          )}
          {stats.warnings > 0 && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {stats.warnings}
            </Badge>
          )}
          {stats.errors > 0 && (
            <Badge variant="outline" className="border-red-500 text-red-600">
              <XCircle className="mr-1 h-3 w-3" />
              {stats.errors}
            </Badge>
          )}
        </div>
      </div>

      {stats.errors > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errori trovati</AlertTitle>
          <AlertDescription>
            {stats.errors} righe con errori. 
            {importMode === 'all_or_nothing' && ' In modalità "Tutto o Niente", correggi gli errori prima di importare.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Modalità Import</Label>
        <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as any)}>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="all_or_nothing" id="all" />
            <Label htmlFor="all" className="cursor-pointer flex-1">
              <div>Tutto o Niente (consigliato)</div>
              <p className="text-xs text-muted-foreground">
                Importa solo se tutte le righe sono valide
              </p>
            </Label>
          </div>
          <div className="flex items-center space-x-2 p-3 border rounded-lg">
            <RadioGroupItem value="partial" id="partial" />
            <Label htmlFor="partial" className="cursor-pointer flex-1">
              <div>Importazione Parziale</div>
              <p className="text-xs text-muted-foreground">
                Importa solo le righe valide, scarta gli errori
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <ScrollArea className="h-[350px] border rounded-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-white">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Dipendente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Orario</TableHead>
              <TableHead className="text-right">Ore</TableHead>
              <TableHead className="w-24">Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validationResults.map((result) => (
              <TableRow 
                key={result.row_number}
                className={
                  result.status === 'error' ? 'bg-red-50 hover:bg-red-100' :
                  result.status === 'warning' ? 'bg-yellow-50 hover:bg-yellow-100' :
                  'hover:bg-gray-50'
                }
              >
                <TableCell className="font-mono text-xs">
                  {result.data.source_row_index}
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium text-sm">
                      {result.employee_name || 'Non trovato'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {result.data.employee_code}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {format(new Date(result.data.date), 'dd/MM/yyyy', { locale: it })}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">
                    {result.data.start_time} - {result.data.end_time}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {result.calculated_hours?.toFixed(2) || '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {result.status === 'valid' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {result.status === 'warning' && (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    {result.status === 'error' && (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    {result.messages.length > 0 && (
                      <span className="text-xs">
                        {result.messages[0]?.message}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-2">
          {(stats.errors > 0 || stats.warnings > 0) && (
            <Button
              onClick={downloadErrors}
              variant="outline"
              size="sm"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Scarica Report Errori
            </Button>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={resetImport}
            variant="outline"
          >
            Annulla
          </Button>
          
          <Button
            onClick={executeImport}
            disabled={loading || (importMode === 'all_or_nothing' && stats.errors > 0)}
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Importazione...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Importa {importMode === 'partial' && stats.errors > 0 ? stats.valid : stats.total} Sessioni
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-pulse">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        </div>
        <h3 className="text-lg font-medium">Importazione in corso</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Elaborazione delle {stats.total} sessioni...
        </p>
      </div>
      <div className="space-y-2">
        <Progress value={progress} className="w-full h-2" />
        <p className="text-center text-sm text-muted-foreground">
          {progress}% completato
        </p>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-medium">Import Completato!</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Le timbrature sono state importate con successo
        </p>
      </div>
      
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Sessioni importate</p>
              <p className="text-3xl font-bold text-green-600">{stats.valid}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tempo totale</p>
              <p className="text-3xl font-bold">
                {Math.round((Date.now() - (progress * 100)) / 1000)}s
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button 
          onClick={resetImport}
          variant="outline"
          className="flex-1"
        >
          <Upload className="mr-2 h-4 w-4" />
          Importa Altri File
        </Button>
        <Button 
          onClick={() => onOpenChange(false)}
          className="flex-1"
        >
          Chiudi
        </Button>
      </div>
    </div>
  );

  // =====================================================
  // MAIN RENDER
  // =====================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import Timbrature Excel
            <Badge variant="secondary">
              <Zap className="mr-1 h-3 w-3" />
              Automatico
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Sistema ottimizzato per file Termoidraulica Bertoletti - Riconoscimento automatico colonne
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}