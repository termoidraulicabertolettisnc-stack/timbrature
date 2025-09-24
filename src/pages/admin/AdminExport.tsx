import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileDown, Calendar, Users, FolderKanban, Settings, Download, FileText, Table } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import * as ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { BenefitsService } from '@/services/BenefitsService';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface ExportSettings {
  format: 'csv' | 'excel' | 'pdf' | 'payroll';
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

interface PayrollData {
  employee: {
    name: string;
    id: string;
  };
  days: {
    [day: number]: {
      ordinary: number;
      overtime: number;
      absence: number;
      absenceType?: string;
      isHoliday: boolean;
    };
  };
  totals: {
    ordinary: number;
    overtime: number;
    absence: number;
  };
  mealVouchers: {
    [amount: string]: number;
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

  // Italian holidays calculator
  const getItalianHolidays = (year: number) => {
    const holidays = [];
    
    // Fixed holidays
    holidays.push(new Date(year, 0, 1)); // Capodanno
    holidays.push(new Date(year, 0, 6)); // Epifania
    holidays.push(new Date(year, 3, 25)); // Festa della Liberazione
    holidays.push(new Date(year, 4, 1)); // Festa del Lavoro
    holidays.push(new Date(year, 5, 2)); // Festa della Repubblica
    holidays.push(new Date(year, 7, 15)); // Ferragosto
    holidays.push(new Date(year, 10, 1)); // Ognissanti
    holidays.push(new Date(year, 11, 8)); // Immacolata Concezione
    holidays.push(new Date(year, 11, 25)); // Natale
    holidays.push(new Date(year, 11, 26)); // Santo Stefano
    
    // Cremona patron saint (San Omobono)
    holidays.push(new Date(year, 10, 13)); // 13 novembre
    
    // Easter related holidays (simplified calculation)
    const easter = getEasterDate(year);
    holidays.push(new Date(easter.getTime() + 86400000)); // Pasquetta
    
    return holidays.map(h => format(h, 'yyyy-MM-dd'));
  };

  const getEasterDate = (year: number) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = Math.floor((h + l - 7 * m + 114) / 31);
    const p = (h + l - 7 * m + 114) % 31;
    return new Date(year, n - 1, p + 1);
  };

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

  const generatePayroll = (data: any[]) => {
    const payrollData: PayrollData[] = [];
    const holidays = getItalianHolidays(new Date(exportSettings.startDate).getFullYear());
    
    // Group data by employee
    const employeeData = data.reduce((acc: any, record: any) => {
      const employeeId = record.employee_id;
      if (!acc[employeeId]) {
        acc[employeeId] = {
          employee: record.employee,
          records: [],
          settings: record.employee_settings
        };
      }
      acc[employeeId].records.push(record);
      return acc;
    }, {});

    // Process each employee
    Object.values(employeeData).forEach((emp: any) => {
      const employee = emp.employee;
      const records = emp.records;
      const settings = emp.settings;
      
      const days: PayrollData['days'] = {};
      let totalOrdinary = 0, totalOvertime = 0, totalAbsence = 0;
      let workingDays = 0;

      // Get days in month
      const startDate = new Date(exportSettings.startDate);
      const endDate = new Date(exportSettings.endDate);
      const daysInMonth = endDate.getDate();

      // Process each day of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = format(new Date(startDate.getFullYear(), startDate.getMonth(), day), 'yyyy-MM-dd');
        const isHoliday = holidays.includes(currentDate);
        const dayRecord = records.find((r: any) => r.date === currentDate);
        
        if (dayRecord) {
          if (dayRecord.is_absence) {
            const absenceHours = dayRecord.absence_hours || 8;
            days[day] = {
              ordinary: 0,
              overtime: 0,
              absence: absenceHours,
              absenceType: dayRecord.absence_type,
              isHoliday
            };
            totalAbsence += absenceHours;
          } else {
            const ordinary = Math.max(0, (dayRecord.total_hours || 0) - (dayRecord.overtime_hours || 0));
            const overtime = dayRecord.overtime_hours || 0;
            
            days[day] = {
              ordinary,
              overtime,
              absence: 0,
              isHoliday
            };
            totalOrdinary += ordinary;
            totalOvertime += overtime;
            
            // Use centralized temporal meal benefit calculation
            const timesheetData = {
              start_time: dayRecord.start_time,
              end_time: dayRecord.end_time,
              lunch_start_time: dayRecord.lunch_start_time,
              lunch_end_time: dayRecord.lunch_end_time,
              lunch_duration_minutes: dayRecord.lunch_duration_minutes,
              total_hours: dayRecord.total_hours,
              user_id: dayRecord.user_id || employee.id,
              date: currentDate
            };
            
            // Calculate meal benefits for payroll
            BenefitsService.calculateMealBenefits(timesheetData, settings, null, currentDate)
              .then(mealBenefits => {
                if (mealBenefits.mealVoucher) {
                  workingDays++;
                }
              })
              .catch(err => {
                console.error('Error calculating meal benefits:', err);
              });
          }
        } else if (!isHoliday) {
          // Non-working day (weekend or absence without record)
          const dayOfWeek = new Date(startDate.getFullYear(), startDate.getMonth(), day).getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
            days[day] = {
              ordinary: 0,
              overtime: 0,
              absence: 0,
              isHoliday: false
            };
          }
        } else {
          // Holiday
          days[day] = {
            ordinary: 0,
            overtime: 0,
            absence: 0,
            isHoliday: true
          };
        }
      }

      // Calculate meal vouchers
      const mealVoucherAmount = settings?.meal_voucher_amount || 8;
      const mealVouchers: PayrollData['mealVouchers'] = {};
      if (workingDays > 0) {
        mealVouchers[mealVoucherAmount.toString()] = workingDays;
      }

      payrollData.push({
        employee: {
          name: employee,
          id: employee.split(' - ')[0] || ''
        },
        days,
        totals: {
          ordinary: totalOrdinary,
          overtime: totalOvertime,
          absence: totalAbsence
        },
        mealVouchers
      });
    });

    return payrollData;
  };

  const generatePayrollExcel = async (payrollData: PayrollData[]) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Buste Pago');
    
    // Create header row
    const headerRow = ['Dipendente', 'Tipo'];
    const daysInMonth = new Date(
      new Date(exportSettings.startDate).getFullYear(),
      new Date(exportSettings.startDate).getMonth() + 1,
      0
    ).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      headerRow.push(day.toString());
    }
    headerRow.push('Totale', 'Buoni Pasto 8€');
    
    // Add header row to worksheet
    const headerRowRef = worksheet.addRow(headerRow);
    
    // Style headers
    headerRowRef.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.font = { 
        bold: true, 
        color: { argb: 'FFFFFFFF' },
        size: 11
      };
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: 'center' 
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    payrollData.forEach((empData) => {
      // Ordinary hours row
      const ordinaryRow = [empData.employee.name, 'O'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayData = empData.days[day];
        ordinaryRow.push((dayData?.ordinary || 0).toString());
      }
      ordinaryRow.push(empData.totals.ordinary.toString());
      ordinaryRow.push('');
      
      const ordinaryRowRef = worksheet.addRow(ordinaryRow);
      ordinaryRowRef.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F7E6' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Overtime hours row
      const overtimeRow = ['', 'S'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayData = empData.days[day];
        overtimeRow.push((dayData?.overtime || 0).toString());
      }
      overtimeRow.push(empData.totals.overtime.toString());
      overtimeRow.push('');
      
      const overtimeRowRef = worksheet.addRow(overtimeRow);
      overtimeRowRef.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F2FF' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Absence hours row
      const absenceRow = ['', 'N'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayData = empData.days[day];
        absenceRow.push((dayData?.absence || 0).toString());
      }
      absenceRow.push(empData.totals.absence.toString());
      absenceRow.push((empData.mealVouchers['8'] || 0).toString());
      
      const absenceRowRef = worksheet.addRow(absenceRow);
      absenceRowRef.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE6E6' }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Empty row between employees
      worksheet.addRow([]);
    });

    // Auto-fit columns
    worksheet.columns.forEach((column, index) => {
      if (index === 0) {
        column.width = 20; // Employee name column
      } else if (index === 1) {
        column.width = 5; // Type column
      } else if (index <= daysInMonth + 1) {
        column.width = 5; // Day columns
      } else {
        column.width = 12; // Total and Buoni Pasto columns
      }
    });
    
    return workbook.xlsx.writeBuffer();
  };

  const generateCSV = (data: any[]): string => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape commas and quotes
          return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
            ? `"${value.replace(/"/g, '""')}"` 
            : value;
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  };

  const generateExcel = async (data: any[], filename: string): Promise<void> => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timesheets');
    
    if (data.length > 0) {
      // Add headers
      const headers = Object.keys(data[0]);
      const headerRow = worksheet.addRow(headers);
      
      // Style headers
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        cell.font = { 
          bold: true, 
          color: { argb: 'FFFFFFFF' },
          size: 11
        };
        cell.alignment = { 
          vertical: 'middle', 
          horizontal: 'center' 
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      // Add data rows
      data.forEach(row => {
        const dataRow = worksheet.addRow(headers.map(header => row[header] || ''));
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });
      
      // Auto-fit columns
      worksheet.columns.forEach((column, index) => {
        const header = headers[index];
        column.width = Math.max(header ? header.length : 10, 20);
      });
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const generatePDF = (data: any[], filename: string, startDate: string, endDate: string): void => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('Report Timesheets', 14, 22);
    
    // Subtitle
    doc.setFontSize(12);
    doc.text(`Periodo: ${startDate} - ${endDate}`, 14, 32);
    doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 14, 40);
    doc.text(`Totale record: ${data.length}`, 14, 48);
    
    if (data.length > 0) {
      // Prepare table data
      const headers = Object.keys(data[0]);
      const tableData = data.map(row => headers.map(header => row[header] || ''));
      
      // Add table
      doc.autoTable({
        head: [headers],
        body: tableData,
        startY: 55,
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [60, 141, 188],
          textColor: 255,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: 55 },
      });
    }
    
    doc.save(filename);
  };

  const downloadFile = (content: string, filename: string, mimeType: string): void => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setLoading(true);
    
    try {
      const exportData = {
        dateRange: exportSettings.dateRange,
        startDate: exportSettings.startDate,
        endDate: exportSettings.endDate,
        selectedEmployees: exportSettings.selectedEmployees,
        selectedProjects: exportSettings.selectedProjects,
        includedFields: exportSettings.includedFields,
        format: exportSettings.format,
      };

      console.log('Sending export request:', exportData);

      const { data: response, error } = await supabase.functions.invoke('generate-export', {
        body: exportData,
      });

      if (error) {
        console.error('Export error:', error);
        throw error;
      }

      console.log('Export response:', response);

      if (!response || response.length === 0) {
        toast({
          title: "Nessun dato trovato",
          description: "Non sono stati trovati dati per i criteri selezionati.",
          variant: "destructive",
        });
        return;
      }

      // Generate filename
      const dateRange = exportSettings.dateRange === 'custom' 
        ? `${exportSettings.startDate}_${exportSettings.endDate}`
        : `${exportSettings.startDate}_${exportSettings.endDate}`;

      // Generate and download file based on format
      if (exportSettings.format === 'payroll') {
        const payrollData = generatePayroll(response);
        const excelBuffer = await generatePayrollExcel(payrollData);
        const blob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `buste-paga-${format(new Date(exportSettings.startDate), 'yyyy-MM')}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else if (exportSettings.format === 'csv') {
        const csvContent = generateCSV(response);
        const filename = `timesheets_${dateRange}.csv`;
        downloadFile(csvContent, filename, 'text/csv');
      } else if (exportSettings.format === 'excel') {
        const filename = `timesheets_${dateRange}.xlsx`;
        generateExcel(response, filename);
      } else if (exportSettings.format === 'pdf') {
        const filename = `timesheets_${dateRange}.pdf`;
        generatePDF(response, filename, exportSettings.startDate, exportSettings.endDate);
      }

      toast({
        title: "Export completato",
        description: `File scaricato con successo. ${response.length} record esportati.`,
      });

    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: "Errore durante l'export",
        description: error.message || "Si è verificato un errore durante la generazione del file.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canExport = exportSettings.selectedEmployees.length > 0;

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
                    <SelectItem value="payroll">Buste Paga (Excel)</SelectItem>
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

          {/* Fields to Include - Hide for payroll format */}
          {exportSettings.format !== 'payroll' && (
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
                  <Label htmlFor="overtimeHours">Straordinari</Label>
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
                  <Label htmlFor="location">Posizione</Label>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Employee Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Dipendenti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectAllEmployees}
                >
                  Seleziona tutti
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={clearAllEmployees}
                >
                  Deseleziona tutti
                </Button>
              </div>
              
              <ScrollArea className="h-32 border rounded p-4">
                {employees.map((employee) => (
                  <div key={employee.user_id} className="flex items-center space-x-2 py-1">
                    <Checkbox 
                      id={`employee-${employee.user_id}`}
                      checked={exportSettings.selectedEmployees.includes(employee.user_id)}
                      onCheckedChange={(checked) => handleEmployeeToggle(employee.user_id, checked as boolean)}
                    />
                    <Label htmlFor={`employee-${employee.user_id}`}>
                      {employee.first_name} {employee.last_name}
                    </Label>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Projects Section - Hide for payroll format */}
          {exportSettings.format !== 'payroll' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5" />
                  Progetti
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={selectAllProjects}
                  >
                    Seleziona tutti
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={clearAllProjects}
                  >
                    Deseleziona tutti
                  </Button>
                </div>
                
                <ScrollArea className="h-32 border rounded p-4">
                  {projects.map((project) => (
                    <div key={project.id} className="flex items-center space-x-2 py-1">
                      <Checkbox 
                        id={`project-${project.id}`}
                        checked={exportSettings.selectedProjects.includes(project.id)}
                        onCheckedChange={(checked) => handleProjectToggle(project.id, checked as boolean)}
                      />
                      <Label htmlFor={`project-${project.id}`}>
                        {project.name}
                      </Label>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Export Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileDown className="h-5 w-5" />
                Riepilogo Export
              </CardTitle>
              <CardDescription>
                Verifica le impostazioni prima di procedere con l'export
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p><strong>Formato:</strong> {
                  exportSettings.format === 'payroll' ? 'Buste Paga (Excel)' : 
                  exportSettings.format === 'csv' ? 'CSV' :
                  exportSettings.format === 'excel' ? 'Excel' : 'PDF'
                }</p>
                <p><strong>Periodo:</strong> {exportSettings.startDate} - {exportSettings.endDate}</p>
                <p><strong>Dipendenti selezionati:</strong> {exportSettings.selectedEmployees.length}</p>
                {exportSettings.format !== 'payroll' && (
                  <p><strong>Progetti selezionati:</strong> {exportSettings.selectedProjects.length}</p>
                )}
              </div>

              <Separator />

              <Button 
                onClick={handleExport}
                disabled={!canExport || loading}
                className="w-full"
                size="lg"
              >
                <Download className="mr-2 h-4 w-4" />
                {loading ? 'Generazione in corso...' : 'Genera Export'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}