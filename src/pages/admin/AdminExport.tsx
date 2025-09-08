import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { FileDown, Calendar, Users, FolderKanban, Settings, Download, FileText, Table } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface ExportSettings {
  format: 'csv' | 'excel' | 'pdf';
  dateRange: 'today' | 'thisWeek' | 'thisMonth' | 'custom';
  startDate: string;
  endDate: string;
  selectedEmployees: string[];
  selectedProjects: string[];
  includedFields: {
    date: boolean;
    employee: boolean;
    project: boolean;
    startTime: boolean;
    endTime: boolean;
    totalHours: boolean;
    overtimeHours: boolean;
    nightHours: boolean;
    notes: boolean;
    location: boolean;
  };
}

export default function AdminExport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'excel',
    dateRange: 'thisMonth',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    selectedEmployees: [],
    selectedProjects: [],
    includedFields: {
      date: true,
      employee: true,
      project: true,
      startTime: true,
      endTime: true,
      totalHours: true,
      overtimeHours: true,
      nightHours: true,
      notes: false,
      location: false,
    }
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (exportSettings.dateRange !== 'custom') {
      updateDatesForRange();
    }
  }, [exportSettings.dateRange]);

  const loadData = async () => {
    try {
      // Load employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('is_active', true)
        .order('first_name');

      if (employeesError) throw employeesError;
      setEmployees(employeesData || []);

      // Load projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati",
        variant: "destructive",
      });
    }
  };

  const updateDatesForRange = () => {
    const now = new Date();
    if (exportSettings.dateRange === 'today') {
      const today = format(new Date(), 'yyyy-MM-dd');
      setExportSettings(prev => ({
        ...prev,
        startDate: today,
        endDate: today,
      }));
    } else if (exportSettings.dateRange === 'thisWeek') {
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      const endOfWeek = new Date(now.setDate(startOfWeek.getDate() + 6));
      setExportSettings(prev => ({
        ...prev,
        startDate: format(startOfWeek, 'yyyy-MM-dd'),
        endDate: format(endOfWeek, 'yyyy-MM-dd'),
      }));
    } else if (exportSettings.dateRange === 'thisMonth') {
      setExportSettings(prev => ({
        ...prev,
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      }));
    }
  };

  const handleFieldChange = (field: keyof ExportSettings['includedFields'], checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      includedFields: {
        ...prev.includedFields,
        [field]: checked
      }
    }));
  };

  const handleEmployeeToggle = (employeeId: string, checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      selectedEmployees: checked 
        ? [...prev.selectedEmployees, employeeId]
        : prev.selectedEmployees.filter(id => id !== employeeId)
    }));
  };

  const handleProjectToggle = (projectId: string, checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      selectedProjects: checked 
        ? [...prev.selectedProjects, projectId]
        : prev.selectedProjects.filter(id => id !== projectId)
    }));
  };

  const selectAllEmployees = () => {
    setExportSettings(prev => ({
      ...prev,
      selectedEmployees: employees.map(emp => emp.user_id)
    }));
  };

  const selectAllProjects = () => {
    setExportSettings(prev => ({
      ...prev,
      selectedProjects: projects.map(proj => proj.id)
    }));
  };

  const clearAllEmployees = () => {
    setExportSettings(prev => ({
      ...prev,
      selectedEmployees: []
    }));
  };

  const clearAllProjects = () => {
    setExportSettings(prev => ({
      ...prev,
      selectedProjects: []
    }));
  };

  const handleExport = async () => {
    setLoading(true);
    
    try {
      const exportData = {
        format: exportSettings.format,
        dateRange: exportSettings.dateRange,
        startDate: exportSettings.startDate,
        endDate: exportSettings.endDate,
        selectedEmployees: exportSettings.selectedEmployees,
        selectedProjects: exportSettings.selectedProjects,
        includedFields: exportSettings.includedFields,
      };

      console.log('Sending export request:', exportData);

      const { data, error } = await supabase.functions.invoke('generate-export', {
        body: exportData,
      });

      if (error) {
        console.error('Export error:', error);
        throw error;
      }

      // Handle the response based on format
      let blob: Blob;
      let filename: string;
      const today = new Date().toISOString().split('T')[0];
      const dateRange = exportSettings.dateRange === 'custom' 
        ? `${exportSettings.startDate}_${exportSettings.endDate}`
        : `${today}`;

      if (exportSettings.format === 'csv') {
        blob = new Blob([data], { type: 'text/csv' });
        filename = `timesheets_${dateRange}.csv`;
      } else if (exportSettings.format === 'excel') {
        // Decode base64 for Excel
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        filename = `timesheets_${dateRange}.xlsx`;
      } else {
        // Decode base64 for PDF
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/pdf' });
        filename = `timesheets_${dateRange}.pdf`;
      }

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export completato",
        description: `File ${filename} scaricato con successo.`,
      });

    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Errore durante l'export",
        description: "Si è verificato un errore durante la generazione del file.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canExport = exportSettings.selectedEmployees.length > 0 || exportSettings.selectedProjects.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Export Dati</h2>
          <p className="text-muted-foreground">
            Esporta i dati dei timesheets in diversi formati
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Export Settings */}
        <div className="space-y-6">
          {/* Format and Date Range */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Impostazioni Export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Formato File</Label>
                <Select 
                  value={exportSettings.format} 
                  onValueChange={(value) => setExportSettings(prev => ({ ...prev, format: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV (Comma Separated)</SelectItem>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select 
                  value={exportSettings.dateRange} 
                  onValueChange={(value) => setExportSettings(prev => ({ ...prev, dateRange: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Oggi</SelectItem>
                    <SelectItem value="thisWeek">Settimana Corrente</SelectItem>
                    <SelectItem value="thisMonth">Mese Corrente</SelectItem>
                    <SelectItem value="custom">Periodo Personalizzato</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data Inizio</Label>
                  <Input
                    type="date"
                    value={exportSettings.startDate}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, startDate: e.target.value }))}
                    disabled={exportSettings.dateRange !== 'custom'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data Fine</Label>
                  <Input
                    type="date"
                    value={exportSettings.endDate}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, endDate: e.target.value }))}
                    disabled={exportSettings.dateRange !== 'custom'}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fields to Include */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table className="h-5 w-5" />
                Campi da Includere
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="date"
                  checked={exportSettings.includedFields.date}
                  onCheckedChange={(checked) => handleFieldChange('date', checked as boolean)}
                />
                <Label htmlFor="date">Data</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="employee"
                  checked={exportSettings.includedFields.employee}
                  onCheckedChange={(checked) => handleFieldChange('employee', checked as boolean)}
                />
                <Label htmlFor="employee">Dipendente</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="project"
                  checked={exportSettings.includedFields.project}
                  onCheckedChange={(checked) => handleFieldChange('project', checked as boolean)}
                />
                <Label htmlFor="project">Progetto/Commessa</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="startTime"
                  checked={exportSettings.includedFields.startTime}
                  onCheckedChange={(checked) => handleFieldChange('startTime', checked as boolean)}
                />
                <Label htmlFor="startTime">Ora Inizio</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="endTime"
                  checked={exportSettings.includedFields.endTime}
                  onCheckedChange={(checked) => handleFieldChange('endTime', checked as boolean)}
                />
                <Label htmlFor="endTime">Ora Fine</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="totalHours"
                  checked={exportSettings.includedFields.totalHours}
                  onCheckedChange={(checked) => handleFieldChange('totalHours', checked as boolean)}
                />
                <Label htmlFor="totalHours">Ore Totali</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="overtimeHours"
                  checked={exportSettings.includedFields.overtimeHours}
                  onCheckedChange={(checked) => handleFieldChange('overtimeHours', checked as boolean)}
                />
                <Label htmlFor="overtimeHours">Ore Straordinarie</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="nightHours"
                  checked={exportSettings.includedFields.nightHours}
                  onCheckedChange={(checked) => handleFieldChange('nightHours', checked as boolean)}
                />
                <Label htmlFor="nightHours">Ore Notturne</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="notes"
                  checked={exportSettings.includedFields.notes}
                  onCheckedChange={(checked) => handleFieldChange('notes', checked as boolean)}
                />
                <Label htmlFor="notes">Note</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="location"
                  checked={exportSettings.includedFields.location}
                  onCheckedChange={(checked) => handleFieldChange('location', checked as boolean)}
                />
                <Label htmlFor="location">Coordinate GPS</Label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="space-y-6">
          {/* Employee Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Dipendenti ({exportSettings.selectedEmployees.length} selezionati)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllEmployees}>
                  Seleziona Tutti
                </Button>
                <Button variant="outline" size="sm" onClick={clearAllEmployees}>
                  Deseleziona Tutti
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-60 overflow-y-auto space-y-2">
              {employees.map((employee) => (
                <div key={employee.user_id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`emp-${employee.user_id}`}
                    checked={exportSettings.selectedEmployees.includes(employee.user_id)}
                    onCheckedChange={(checked) => handleEmployeeToggle(employee.user_id, checked as boolean)}
                  />
                  <Label htmlFor={`emp-${employee.user_id}`} className="text-sm">
                    {employee.first_name} {employee.last_name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Project Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5" />
                Commesse ({exportSettings.selectedProjects.length} selezionate)
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllProjects}>
                  Seleziona Tutte
                </Button>
                <Button variant="outline" size="sm" onClick={clearAllProjects}>
                  Deseleziona Tutte
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-60 overflow-y-auto space-y-2">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`proj-${project.id}`}
                    checked={exportSettings.selectedProjects.includes(project.id)}
                    onCheckedChange={(checked) => handleProjectToggle(project.id, checked as boolean)}
                  />
                  <Label htmlFor={`proj-${project.id}`} className="text-sm">
                    {project.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Export Button */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" />
                Genera Export
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p>Periodo: {format(new Date(exportSettings.startDate), 'dd/MM/yyyy')} - {format(new Date(exportSettings.endDate), 'dd/MM/yyyy')}</p>
                  <p>Formato: {exportSettings.format.toUpperCase()}</p>
                  <p>Dipendenti: {exportSettings.selectedEmployees.length}</p>
                  <p>Commesse: {exportSettings.selectedProjects.length}</p>
                </div>

                <Button 
                  onClick={handleExport}
                  disabled={!canExport || loading}
                  className="w-full flex items-center gap-2"
                  size="lg"
                >
                  {loading ? (
                    <FileText className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {loading ? 'Generazione in corso...' : 'Genera Export'}
                </Button>

                {!canExport && (
                  <p className="text-sm text-muted-foreground text-center">
                    Seleziona almeno un dipendente o una commessa per procedere
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}