import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { usePayrollData, type PayrollData } from '@/hooks/usePayrollData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import * as ExcelJS from 'exceljs';

export default function PayrollDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'sheets' | 'files'>('sheets');

  const { data: payrollData = [], isLoading: loading } = usePayrollData(selectedMonth);

  // Italian holidays for 2024 (you can expand this)
  const getItalianHolidays = (year: number) => {
    const holidays = new Set([
      `${year}-01-01`, // Capodanno
      `${year}-01-06`, // Epifania
      `${year}-04-25`, // Festa della Liberazione
      `${year}-05-01`, // Festa del Lavoro
      `${year}-06-02`, // Festa della Repubblica
      `${year}-08-15`, // Ferragosto
      `${year}-11-01`, // Ognissanti
      `${year}-12-08`, // Immacolata Concezione
      `${year}-12-25`, // Natale
      `${year}-12-26`, // Santo Stefano
      `${year}-11-13`, // San Omobono (Cremona) - 13 novembre
    ]);
    
    // Easter-related holidays (simplified calculation for 2024)
    if (year === 2024) {
      holidays.add('2024-03-31'); // Pasqua
      holidays.add('2024-04-01'); // Lunedì dell'Angelo
    }
    
    return holidays;
  };

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-');
    return new Date(parseInt(year), parseInt(month), 0).getDate();
  };

  const isHoliday = (day: number) => {
    const [year, month] = selectedMonth.split('-');
    const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
    const holidays = getItalianHolidays(parseInt(year));
    return holidays.has(dateStr);
  };

  const isSunday = (day: number) => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, day);
    return date.getDay() === 0;
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-data', selectedMonth] });
  };

  const getAbsenceTypeLabel = (type: string | null) => {
    if (!type) return '';
    const labels: { [key: string]: string } = {
      'assenza_ingiustificata': 'A',
      'ferie': 'F',
      'festivita': 'FS',
      'infortunio': 'I',
      'malattia': 'M',
      'permesso_retribuito': 'PR',
      'permesso_non_retribuito': 'PNR'
    };
    return labels[type] || type.charAt(0).toUpperCase();
  };

  // Helper function to create worksheet content for a company
  const createCompanyWorksheet = (
    workbook: ExcelJS.Workbook,
    companyName: string,
    employees: PayrollData[],
    year: string,
    month: string,
    monthName: string,
    daysInMonth: number
  ) => {
    const sheetName = companyName.substring(0, 31).replace(/[\\/*?:[\]]/g, '');
    const worksheet = workbook.addWorksheet(sheetName);
    
    const headers = ['Dipendente'];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(parseInt(year), parseInt(month) - 1, day);
      const dayOfWeek = date.getDay();
      const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
      headers.push(`${day} ${dayNames[dayOfWeek]}`);
    }
    headers.push('Tot', 'Buoni Pasto');
    
    // Title row
    const monthTitleRow = worksheet.addRow([`${companyName.toUpperCase()} - ${monthName.toUpperCase()} ${year}`]);
    monthTitleRow.getCell(1).font = { bold: true, size: 14 };
    monthTitleRow.getCell(1).alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A1:${String.fromCharCode(65 + Math.min(headers.length - 1, 25))}1`);
    
    worksheet.addRow([]);
    
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    
    employees.forEach((employee) => {
      const baseRowTypes = ['O', 'S'];
      const baseRowColors = ['FFE6F7E6', 'FFE6F2FF'];
      
      baseRowTypes.forEach((type, typeIndex) => {
        const rowData = [`${type} - ${employee.employee_name}`];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          let value = '';
          if (type === 'O') {
            const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
            value = ordinary > 0 ? ordinary.toFixed(1) : '';
          } else {
            const overtime = employee.daily_data[dayKey]?.overtime || 0;
            value = overtime > 0 ? overtime.toFixed(1) : '';
          }
          rowData.push(value);
        }
        if (type === 'O') {
          rowData.push((employee.totals.ordinary ?? 0).toFixed(1));
          rowData.push((employee.meal_vouchers ?? 0) > 0 ? `${employee.meal_vouchers} x €${(employee.meal_voucher_amount ?? 0).toFixed(2)}` : '-');
        } else {
          const overtimeTotal = employee.totals.overtime ?? 0;
          rowData.push(overtimeTotal > 0 ? overtimeTotal.toFixed(1) : '');
          rowData.push('-');
        }
        
        const row = worksheet.addRow(rowData);
        row.eachCell((cell, colNumber) => {
          let bgColor = baseRowColors[typeIndex];
          if (colNumber >= 2 && colNumber <= daysInMonth + 1) {
            const dayNum = colNumber - 1;
            const date = new Date(parseInt(year), parseInt(month) - 1, dayNum);
            if (date.getDay() === 0 || isHoliday(dayNum)) bgColor = 'FFFFCCCC';
          }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' };
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
      });

      Object.entries(employee.totals.absence_totals).forEach(([absenceType, hours]) => {
        if (hours > 0) {
          const rowData = [`${getAbsenceTypeLabel(absenceType)} - ${employee.employee_name}`];
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            const absence = employee.daily_data[dayKey]?.absence;
            rowData.push(absence === absenceType ? getAbsenceTypeLabel(absence) : '');
          }
          rowData.push((hours ?? 0).toFixed(1));
          rowData.push('-');
          
          const row = worksheet.addRow(rowData);
          row.eachCell((cell, colNumber) => {
            let bgColor = 'FFFFE6E6';
            if (colNumber >= 2 && colNumber <= daysInMonth + 1) {
              const dayNum = colNumber - 1;
              const date = new Date(parseInt(year), parseInt(month) - 1, dayNum);
              if (date.getDay() === 0 || isHoliday(dayNum)) bgColor = 'FFFFCCCC';
            }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.font = { size: 10 };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          });
        }
      });
    });
    
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 25;
      else if (index <= daysInMonth) column.width = 8;
      else if (index === daysInMonth + 1) column.width = 10;
      else column.width = 15;
    });
    
    worksheet.addRow([]);
    worksheet.addRow(['LEGENDA:']);
    worksheet.addRow(['A: Assenza Ingiustificata', '', 'F: Ferie', '', 'FS: Festività']);
    worksheet.addRow(['I: Infortunio', '', 'M: Malattia', '', 'PR: Permesso Retribuito', '', 'PNR: Permesso non retribuito']);
  };

  const downloadWorkbook = async (workbook: ExcelJS.Workbook, fileName: string) => {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = async (mode: 'sheets' | 'files') => {
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = getDaysInMonth();
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                       'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const monthName = monthNames[parseInt(month) - 1];
    
    const employeesByCompany = payrollData.reduce((acc, employee) => {
      const companyKey = employee.company_id || 'unknown';
      const companyName = employee.company_name || 'Azienda sconosciuta';
      if (!acc[companyKey]) acc[companyKey] = { name: companyName, employees: [] };
      acc[companyKey].employees.push(employee);
      return acc;
    }, {} as { [key: string]: { name: string; employees: PayrollData[] } });

    if (mode === 'sheets') {
      // Single file with multiple sheets
      const workbook = new ExcelJS.Workbook();
      Object.values(employeesByCompany).forEach(companyData => {
        createCompanyWorksheet(workbook, companyData.name, companyData.employees, year, month, monthName, daysInMonth);
      });
      await downloadWorkbook(workbook, `${month}_${year}_Buste_Paga.xlsx`);
    } else {
      // Multiple files, one per company
      for (const companyData of Object.values(employeesByCompany)) {
        const workbook = new ExcelJS.Workbook();
        createCompanyWorksheet(workbook, companyData.name, companyData.employees, year, month, monthName, daysInMonth);
        const sanitizedCompanyName = companyData.name.replace(/[\\/*?:"<>|]/g, '_');
        await downloadWorkbook(workbook, `${month}_${year}_Buste_Paga_${sanitizedCompanyName}.xlsx`);
      }
    }
    
    setExportDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Calendar className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-muted-foreground">Caricamento dati buste paga...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-foreground">Vista Buste Paga</h3>
          <p className="text-sm text-muted-foreground">
            Riepilogo mensile per ufficio buste paga
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            className="gap-2 flex-shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Aggiorna</span>
          </Button>
          <Button
            onClick={() => setExportDialogOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 flex-shrink-0"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Esporta Excel</span>
            <span className="sm:hidden">Excel</span>
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const label = date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
                return (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Dipendenti Attivi</p>
              <p className="text-2xl font-bold">{payrollData.length}</p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ore Ordinarie</p>
              <p className="text-2xl font-bold">
                {payrollData.reduce((sum, emp) => sum + (emp.totals.ordinary ?? 0), 0).toFixed(0)}h
              </p>
            </div>
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ore Straordinario</p>
              <p className="text-2xl font-bold">
                {payrollData.reduce((sum, emp) => sum + (emp.totals.overtime ?? 0), 0).toFixed(0)}h
              </p>
            </div>
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
        </Card>
      </div>

      {/* Payroll Table - Tre righe per dipendente */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Dettaglio Mensile Completo</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 w-40 min-w-40 text-xs font-medium border-r">
                    Dipendente
                  </TableHead>
                  {Array.from({ length: getDaysInMonth() }, (_, i) => {
                    const day = i + 1;
                    const isHol = isHoliday(day);
                    const isSun = isSunday(day);
                    
                    // Calcola il giorno della settimana
                    const [year, month] = selectedMonth.split('-');
                    const date = new Date(parseInt(year), parseInt(month) - 1, day);
                    const dayOfWeek = date.getDay();
                    const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
                    const dayName = dayNames[dayOfWeek];
                    
                    return (
                      <TableHead 
                        key={day} 
                        className={`text-center w-8 min-w-8 max-w-8 text-xs font-medium p-1 ${
                          isHol || isSun ? 'bg-red-50 text-red-700' : ''
                        }`}
                        title={`${dayName} ${day}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold">{day}</span>
                          <span className="text-xs font-normal opacity-75">{dayName}</span>
                        </div>
                      </TableHead>
                    );
                  })}
                   <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-gray-50 border-l">Tot</TableHead>
                   <TableHead className="text-center w-16 min-w-16 text-xs font-medium bg-yellow-50">Buoni Pasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollData.map((employee) => (
                  <React.Fragment key={employee.employee_id}>
                    {/* Riga Ore Ordinarie */}
                    <TableRow className="hover:bg-green-50/50">
                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs p-2 border-r">
                        <span className="text-green-700 font-bold">O</span> - {employee.employee_name}
                      </TableCell>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => {
                        const day = i + 1;
                        const dayKey = String(day).padStart(2, '0');
                        const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
                        const isHol = isHoliday(day);
                        const isSun = isSunday(day);
                        
                        return (
                          <TableCell 
                            key={day} 
                            className={`text-center p-1 text-xs ${
                              isHol || isSun ? 'bg-red-50' : ''
                            } ${ordinary > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}
                          >
                            {ordinary > 0 ? ordinary.toFixed(1) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-green-700 text-xs p-1 bg-gray-50 border-l">
                        {(employee.totals.ordinary ?? 0).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-yellow-50">
                        {(employee.meal_vouchers ?? 0) > 0 ? (
                          <div className="flex flex-col">
                            <span>{employee.meal_vouchers}</span>
                            <span className="text-xs opacity-75">€{(employee.meal_voucher_amount ?? 0).toFixed(2)}</span>
                          </div>
                        ) : '-'}
                      </TableCell>
                    </TableRow>

                    {/* Riga Ore Straordinarie */}
                    <TableRow className="hover:bg-blue-50/50">
                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs p-2 border-r">
                        <span className="text-blue-700 font-bold">S</span> - {employee.employee_name}
                      </TableCell>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => {
                        const day = i + 1;
                        const dayKey = String(day).padStart(2, '0');
                        const overtime = employee.daily_data[dayKey]?.overtime || 0;
                        const isHol = isHoliday(day);
                        const isSun = isSunday(day);
                        
                        return (
                          <TableCell 
                            key={day} 
                            className={`text-center p-1 text-xs ${
                              isHol || isSun ? 'bg-red-50' : ''
                            } ${overtime > 0 ? 'text-blue-700 font-medium' : 'text-muted-foreground'}`}
                          >
                            {overtime > 0 ? overtime.toFixed(1) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-blue-700 text-xs p-1 bg-gray-50 border-l">
                        {(employee.totals.overtime ?? 0) > 0 ? (employee.totals.overtime ?? 0).toFixed(1) : ''}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                    </TableRow>

                    {/* Righe Assenze Dinamiche */}
                    {Object.entries(employee.totals.absence_totals).map(([absenceType, hours]) => {
                      if (hours > 0) {
                        return (
                          <TableRow key={`${employee.employee_id}-${absenceType}`} className="hover:bg-red-50/50">
                            <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs p-2 border-r">
                              <span className="text-red-700 font-bold">{getAbsenceTypeLabel(absenceType)}</span> - {employee.employee_name}
                            </TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const day = i + 1;
                              const dayKey = String(day).padStart(2, '0');
                              const absence = employee.daily_data[dayKey]?.absence;
                              const isHol = isHoliday(day);
                              const isSun = isSunday(day);
                              
                              return (
                                <TableCell 
                                  key={day} 
                                  className={`text-center p-1 text-xs ${
                                    isHol || isSun ? 'bg-red-50' : ''
                                  }`}
                                >
                                  {absence === absenceType ? (
                                    <span className="text-red-700 font-bold text-xs">
                                      {getAbsenceTypeLabel(absence)}
                                    </span>
                                  ) : ''}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold text-red-700 text-xs p-1 bg-gray-50 border-l">
                              {hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                          </TableRow>
                        );
                      }
                      return null;
                    })}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compact Legend */}
      <Card className="p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-6 text-xs">
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
              <strong>O:</strong> Ore Ordinarie
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
              <strong>S:</strong> Ore Straordinario
            </span>
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
              <strong>N:</strong> Giorni di Assenza
            </span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><strong>A:</strong> Assenza Ingiustificata</span>
            <span><strong>F:</strong> Ferie</span>
            <span><strong>FS:</strong> Festività</span>
            <span><strong>I:</strong> Infortunio</span>
            <span><strong>M:</strong> Malattia</span>
            <span><strong>PR:</strong> Permesso Retribuito</span>
            <span><strong>PNR:</strong> Permesso non retribuito</span>
          </div>
        </div>
      </Card>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Esporta Buste Paga</DialogTitle>
            <DialogDescription>
              Scegli come esportare i dati delle buste paga
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup value={exportMode} onValueChange={(value) => setExportMode(value as 'sheets' | 'files')}>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="sheets" id="sheets" className="mt-1" />
                <Label htmlFor="sheets" className="flex-1 cursor-pointer">
                  <div className="font-medium">File unico con fogli separati</div>
                  <div className="text-sm text-muted-foreground">
                    Un file Excel con un foglio per ogni azienda<br />
                    <code className="text-xs bg-muted px-1 rounded">MM_YYYY_Buste_Paga.xlsx</code>
                  </div>
                </Label>
              </div>
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer mt-2">
                <RadioGroupItem value="files" id="files" className="mt-1" />
                <Label htmlFor="files" className="flex-1 cursor-pointer">
                  <div className="font-medium">File separati per azienda</div>
                  <div className="text-sm text-muted-foreground">
                    Un file Excel per ogni azienda<br />
                    <code className="text-xs bg-muted px-1 rounded">MM_YYYY_Buste_Paga_NomeAzienda.xlsx</code>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={() => exportToExcel(exportMode)}>
              <Download className="h-4 w-4 mr-2" />
              Esporta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
