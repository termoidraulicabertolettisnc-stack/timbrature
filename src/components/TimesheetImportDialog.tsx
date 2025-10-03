import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Eye,
  AlertTriangle,
  RefreshCw,
  FileDown,
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
// MAIN COMPONENT
// =====================================================
export function TimesheetImportDialog({
  open,
  onOpenChange,
  onImportComplete
}: TimesheetImportDialogProps) {
  const { toast } = useToast();
  
  // State management
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'complete'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mappedData, setMappedData] = useState<ImportRow[]>([]);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [importMode, setImportMode] = useState<'all_or_nothing' | 'partial'>('all_or_nothing');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats>({ total: 0, valid: 0, warnings: 0, errors: 0 });
  
  // Column mapping state
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    employee_code: '',
    date: '',
    start_time: '',
    end_time: '',
    pause_minutes: '',
    notes: '',
    site_code: '',
    project_code: ''
  });

  // =====================================================
  // FILE HANDLING
  // =====================================================
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseExcelFile(selectedFile);
    }
  };

  const parseExcelFile = async (file: File) => {
    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });
      
      if (jsonData.length > 0) {
        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1).map((row: any, index) => {
          const obj: any = { source_row_index: index + 2 }; // +2 because Excel is 1-indexed and we skip header
          headers.forEach((header, i) => {
            obj[header] = row[i];
          });
          return obj;
        });
        
        setRawData(rows);
        autoDetectColumns(headers);
        setStep('mapping');
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        title: "Errore",
        description: "Impossibile leggere il file Excel",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // COLUMN MAPPING
  // =====================================================
  const autoDetectColumns = (headers: string[]) => {
    const mapping: Record<string, string> = {};
    
    // Mapping rules for common Italian field names
    const mappingRules: Record<string, string[]> = {
      employee_code: ['codice_fiscale', 'cf', 'employee_code', 'codice_dipendente', 'matricola'],
      date: ['data', 'date', 'giorno'],
      start_time: ['ora_entrata', 'entrata', 'start_time', 'inizio', 'ora_inizio'],
      end_time: ['ora_uscita', 'uscita', 'end_time', 'fine', 'ora_fine'],
      pause_minutes: ['pausa', 'pausa_minuti', 'pause_minutes', 'minuti_pausa'],
      notes: ['note', 'notes', 'descrizione', 'commento'],
      site_code: ['sede', 'site_code', 'codice_sede', 'location'],
      project_code: ['progetto', 'project_code', 'commessa', 'codice_progetto']
    };
    
    Object.entries(mappingRules).forEach(([field, patterns]) => {
      const header = headers.find(h => 
        patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))
      );
      if (header) {
        mapping[field] = header;
      }
    });
    
    setColumnMapping(mapping);
  };

  const applyMapping = () => {
    if (!validateMapping()) {
      toast({
        title: "Mappatura incompleta",
        description: "Mappa almeno i campi obbligatori: Codice Dipendente, Data, Ora Entrata, Ora Uscita",
        variant: "destructive"
      });
      return;
    }

    const mapped = rawData.map((row, index) => ({
      employee_code: row[columnMapping.employee_code] || '',
      date: row[columnMapping.date] || '',
      start_time: row[columnMapping.start_time] || '',
      end_time: row[columnMapping.end_time] || '',
      pause_minutes: row[columnMapping.pause_minutes] ? parseInt(row[columnMapping.pause_minutes]) : undefined,
      notes: row[columnMapping.notes] || '',
      site_code: row[columnMapping.site_code] || '',
      project_code: row[columnMapping.project_code] || '',
      source_row_index: index + 2
    }));
    
    setMappedData(mapped);
    validateData(mapped);
  };

  const validateMapping = (): boolean => {
    return !!(
      columnMapping.employee_code &&
      columnMapping.date &&
      columnMapping.start_time &&
      columnMapping.end_time
    );
  };

  // =====================================================
  // VALIDATION
  // =====================================================
  const validateData = async (data: ImportRow[]) => {
    setLoading(true);
    setStep('preview');
    
    try {
      // Generate batch ID
      const newBatchId = crypto.randomUUID();
      setBatchId(newBatchId);
      
      // Get current user first
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
      // Get current user first
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      
      // Call the process function
      const { data, error } = await supabase
        .rpc('process_import_batch', {
          p_batch_id: batchId,
          p_mode: importMode,
          p_user_id: currentUserId
        });
      
      if (error) throw error;
      
      const result = data[0];
      
      setProgress(100);
      setStep('complete');
      
      toast({
        title: "Import completato",
        description: `Importate ${result.success_count} sessioni. ${result.error_count} errori. ${result.warning_count} avvisi.`,
        variant: result.error_count > 0 ? "destructive" : "default"
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
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // EXPORT FUNCTIONS
  // =====================================================
  const downloadTemplate = () => {
    const template = [
      ['employee_code', 'date', 'start_time', 'end_time', 'pause_minutes', 'notes', 'site_code', 'project_code'],
      ['RSSMRA80A01H501Z', '2025-01-15', '08:00', '12:00', '', 'Mattina', 'SEDE_MI', ''],
      ['RSSMRA80A01H501Z', '2025-01-15', '13:00', '17:00', '', 'Pomeriggio', 'SEDE_MI', ''],
      ['VRDGPP75B15H501X', '2025-01-15', '07:30', '16:00', '30', 'Giornata completa', 'SEDE_BG', 'PROG001']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_timbrature_row_per_session.xlsx');
  };

  const downloadErrors = () => {
    const errorRows = validationResults
      .filter(v => v.status === 'error' || v.status === 'warning')
      .map(v => ({
        'Riga': v.data.source_row_index,
        'Stato': v.status === 'error' ? 'ERRORE' : 'AVVISO',
        'Dipendente': v.data.employee_code,
        'Data': v.data.date,
        'Entrata': v.data.start_time,
        'Uscita': v.data.end_time,
        'Messaggi': v.messages.map(m => m.message).join('; ')
      }));
    
    const ws = XLSX.utils.json_to_sheet(errorRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Errori');
    XLSX.writeFile(wb, 'errori_import_timbrature.xlsx');
  };

  // =====================================================
  // RENDER FUNCTIONS
  // =====================================================
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Import Timbrature Excel</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Template ufficiale: <strong>Una riga = Una sessione</strong>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Per più sessioni nello stesso giorno, usa più righe con la stessa data
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="file">Seleziona file Excel (.xlsx)</Label>
          <Input
            id="file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="mt-2"
          />
        </div>

        <Button 
          onClick={downloadTemplate}
          variant="outline" 
          className="w-full"
        >
          <Download className="mr-2 h-4 w-4" />
          Scarica Template Excel
        </Button>

        {file && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <Badge variant="outline">
                  {(file.size / 1024).toFixed(1)} KB
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Mappatura Colonne</h3>
        <p className="text-sm text-muted-foreground">
          Associa le colonne del tuo file ai campi richiesti
        </p>
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3">
          {Object.entries(columnMapping).map(([field, value]) => {
            const isRequired = ['employee_code', 'date', 'start_time', 'end_time'].includes(field);
            const fieldLabels: Record<string, string> = {
              employee_code: 'Codice Dipendente (CF/Email)',
              date: 'Data',
              start_time: 'Ora Entrata',
              end_time: 'Ora Uscita',
              pause_minutes: 'Pausa (minuti)',
              notes: 'Note',
              site_code: 'Codice Sede',
              project_code: 'Codice Progetto'
            };

            return (
              <div key={field} className="grid grid-cols-2 gap-2 items-center">
                <Label className="flex items-center">
                  {fieldLabels[field]}
                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <select
                  value={value}
                  onChange={(e) => setColumnMapping(prev => ({
                    ...prev,
                    [field]: e.target.value
                  }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">-- Seleziona colonna --</option>
                  {rawData.length > 0 && Object.keys(rawData[0]).map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex space-x-2">
        <Button
          onClick={() => setStep('upload')}
          variant="outline"
          className="flex-1"
        >
          Indietro
        </Button>
        <Button
          onClick={applyMapping}
          className="flex-1"
          disabled={!validateMapping()}
        >
          Continua
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Anteprima Validazione</h3>
        <div className="flex gap-2">
          <Badge variant={stats.errors > 0 ? "destructive" : "default"}>
            {stats.total} righe
          </Badge>
          {stats.valid > 0 && (
            <Badge variant="outline" className="border-green-500 text-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              {stats.valid} valide
            </Badge>
          )}
          {stats.warnings > 0 && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
              <AlertTriangle className="mr-1 h-3 w-3" />
              {stats.warnings} avvisi
            </Badge>
          )}
          {stats.errors > 0 && (
            <Badge variant="outline" className="border-red-500 text-red-600">
              <XCircle className="mr-1 h-3 w-3" />
              {stats.errors} errori
            </Badge>
          )}
        </div>
      </div>

      {stats.errors > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Errori trovati</AlertTitle>
          <AlertDescription>
            Ci sono {stats.errors} errori da correggere prima di procedere.
            {importMode === 'all_or_nothing' && ' In modalità "Tutto o Niente", l\'import verrà annullato.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Modalità Import</Label>
        <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as any)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all_or_nothing" id="all" />
            <Label htmlFor="all" className="cursor-pointer">
              Tutto o Niente (consigliato)
              <p className="text-xs text-muted-foreground">
                Importa solo se tutte le righe sono valide
              </p>
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="partial" id="partial" />
            <Label htmlFor="partial" className="cursor-pointer">
              Parziale
              <p className="text-xs text-muted-foreground">
                Importa solo le righe valide, scarta quelle con errori
              </p>
            </Label>
          </div>
        </RadioGroup>
      </div>

      <ScrollArea className="h-[300px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Riga</TableHead>
              <TableHead>Dipendente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Orario</TableHead>
              <TableHead>Ore</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validationResults.map((result) => (
              <TableRow 
                key={result.row_number}
                className={
                  result.status === 'error' ? 'bg-red-50' :
                  result.status === 'warning' ? 'bg-yellow-50' :
                  'bg-green-50'
                }
              >
                <TableCell>{result.data.source_row_index}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{result.employee_name || 'NON TROVATO'}</div>
                    <div className="text-xs text-muted-foreground">{result.data.employee_code}</div>
                  </div>
                </TableCell>
                <TableCell>{result.data.date}</TableCell>
                <TableCell>{result.data.start_time} - {result.data.end_time}</TableCell>
                <TableCell>{result.calculated_hours?.toFixed(2) || '-'}</TableCell>
                <TableCell>
                  {result.status === 'valid' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {result.status === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                  {result.status === 'error' && (
                    <div className="flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-red-600">
                        {result.messages[0]?.message}
                      </span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="flex space-x-2">
        {(stats.errors > 0 || stats.warnings > 0) && (
          <Button
            onClick={downloadErrors}
            variant="outline"
            size="sm"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Scarica Errori
          </Button>
        )}
        
        <div className="flex-1" />
        
        <Button
          onClick={() => setStep('mapping')}
          variant="outline"
        >
          Indietro
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
            `Importa ${importMode === 'partial' && stats.errors > 0 ? stats.valid : stats.total} Sessioni`
          )}
        </Button>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="space-y-4">
      <div className="text-center">
        <RefreshCw className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
        <h3 className="text-lg font-medium">Importazione in corso...</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Elaborazione delle timbrature
        </p>
      </div>
      <Progress value={progress} className="w-full" />
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-600 mb-4" />
        <h3 className="text-lg font-medium">Import Completato!</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Le timbrature sono state importate correttamente
        </p>
      </div>
      
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Sessioni importate</p>
              <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Righe totali</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button 
        onClick={() => onOpenChange(false)}
        className="w-full"
      >
        Chiudi
      </Button>
    </div>
  );

  // =====================================================
  // MAIN RENDER
  // =====================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Timbrature Excel</DialogTitle>
          <DialogDescription>
            Template Row-Per-Session: Una riga = Una sessione di lavoro
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 'upload' && renderUploadStep()}
          {step === 'mapping' && renderMappingStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>
      </DialogContent>
    </Dialog>
  );
}