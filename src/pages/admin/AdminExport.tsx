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
  dateRange: 'week' | 'month' | 'custom';
  startDate: string;
  endDate: string;
  includeEmployees: string[];
  includeProjects: string[];
  includeFields: {
    basicInfo: boolean;
    timeTracking: boolean;
    overtime: boolean;
    nightShift: boolean;
    mealVouchers: boolean;
    locations: boolean;
    projects: boolean;
  };
}

export default function AdminExport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'excel',
    dateRange: 'month',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    includeEmployees: [],
    includeProjects: [],
    includeFields: {
      basicInfo: true,
      timeTracking: true,
      overtime: true,
      nightShift: true,
      mealVouchers: true,
      locations: false,
      projects: true,
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
    if (exportSettings.dateRange === 'week') {
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
      const endOfWeek = new Date(now.setDate(startOfWeek.getDate() + 6));
      setExportSettings(prev => ({
        ...prev,
        startDate: format(startOfWeek, 'yyyy-MM-dd'),
        endDate: format(endOfWeek, 'yyyy-MM-dd'),
      }));
    } else if (exportSettings.dateRange === 'month') {
      setExportSettings(prev => ({
        ...prev,
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
      }));
    }
  };

  const handleFieldChange = (field: keyof ExportSettings['includeFields'], checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      includeFields: {
        ...prev.includeFields,
        [field]: checked
      }
    }));
  };

  const handleEmployeeToggle = (employeeId: string, checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      includeEmployees: checked 
        ? [...prev.includeEmployees, employeeId]
        : prev.includeEmployees.filter(id => id !== employeeId)
    }));
  };

  const handleProjectToggle = (projectId: string, checked: boolean) => {
    setExportSettings(prev => ({
      ...prev,
      includeProjects: checked 
        ? [...prev.includeProjects, projectId]
        : prev.includeProjects.filter(id => id !== projectId)
    }));
  };

  const selectAllEmployees = () => {
    setExportSettings(prev => ({
      ...prev,
      includeEmployees: employees.map(emp => emp.user_id)
    }));
  };

  const selectAllProjects = () => {
    setExportSettings(prev => ({
      ...prev,
      includeProjects: projects.map(proj => proj.id)
    }));
  };

  const clearAllEmployees = () => {
    setExportSettings(prev => ({
      ...prev,
      includeEmployees: []
    }));
  };

  const clearAllProjects = () => {
    setExportSettings(prev => ({
      ...prev,
      includeProjects: []
    }));
  };

  const handleExport = async () => {
    setLoading(true);
    
    try {
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Export Completato",
        description: `File ${exportSettings.format.toUpperCase()} generato con successo!`,
      });

      // In a real implementation, this would:
      // 1. Query the database based on filters
      // 2. Format data according to selected fields
      // 3. Generate the file in the requested format
      // 4. Trigger download

    } catch (error) {
      console.error('Error during export:', error);
      toast({
        title: "Errore Export",
        description: "Errore durante la generazione del file",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canExport = exportSettings.includeEmployees.length > 0 || exportSettings.includeProjects.length > 0;

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
                    <SelectItem value="week">Settimana Corrente</SelectItem>
                    <SelectItem value="month">Mese Corrente</SelectItem>
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
                  id="basicInfo"
                  checked={exportSettings.includeFields.basicInfo}
                  onCheckedChange={(checked) => handleFieldChange('basicInfo', checked as boolean)}
                />
                <Label htmlFor="basicInfo">Informazioni Base (Nome, Data, etc.)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="timeTracking"
                  checked={exportSettings.includeFields.timeTracking}
                  onCheckedChange={(checked) => handleFieldChange('timeTracking', checked as boolean)}
                />
                <Label htmlFor="timeTracking">Orari (Entrata, Uscita, Pausa)</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="overtime"
                  checked={exportSettings.includeFields.overtime}
                  onCheckedChange={(checked) => handleFieldChange('overtime', checked as boolean)}
                />
                <Label htmlFor="overtime">Ore Straordinarie</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="nightShift"
                  checked={exportSettings.includeFields.nightShift}
                  onCheckedChange={(checked) => handleFieldChange('nightShift', checked as boolean)}
                />
                <Label htmlFor="nightShift">Ore Notturne</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="mealVouchers"
                  checked={exportSettings.includeFields.mealVouchers}
                  onCheckedChange={(checked) => handleFieldChange('mealVouchers', checked as boolean)}
                />
                <Label htmlFor="mealVouchers">Buoni Pasto</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="locations"
                  checked={exportSettings.includeFields.locations}
                  onCheckedChange={(checked) => handleFieldChange('locations', checked as boolean)}
                />
                <Label htmlFor="locations">Coordinate GPS</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="projects"
                  checked={exportSettings.includeFields.projects}
                  onCheckedChange={(checked) => handleFieldChange('projects', checked as boolean)}
                />
                <Label htmlFor="projects">Informazioni Commesse</Label>
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
                Dipendenti ({exportSettings.includeEmployees.length} selezionati)
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
                    checked={exportSettings.includeEmployees.includes(employee.user_id)}
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
                Commesse ({exportSettings.includeProjects.length} selezionate)
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
                    checked={exportSettings.includeProjects.includes(project.id)}
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
                  <p>Dipendenti: {exportSettings.includeEmployees.length}</p>
                  <p>Commesse: {exportSettings.includeProjects.length}</p>
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