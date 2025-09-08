import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';

interface PayrollData {
  employee_id: string;
  employee_name: string;
  daily_data: { [day: string]: { ordinary: number; overtime: number; absence: string | null } };
  totals: { ordinary: number; overtime: number; absence: number };
  meal_vouchers: number;
  meal_voucher_amount: number;
}

export default function PayrollDashboard() {
  const { user } = useAuth();
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

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

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

      // Get all employees in the company first
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, company_id')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      const profiles = profilesData || [];
      const userIds = profiles.map(p => p.user_id);

      if (userIds.length === 0) {
        setPayrollData([]);
        return;
      }

      // Get timesheets for the period
      const { data: timesheets, error: timesheetError } = await supabase
        .from('timesheets')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false);

      if (timesheetError) throw timesheetError;

      // Get absences for the period
      const { data: absences, error: absenceError } = await supabase
        .from('employee_absences')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate);

      if (absenceError) throw absenceError;

      // Get employee settings for meal voucher calculation
      const { data: employeeSettings, error: settingsError } = await supabase
        .from('employee_settings')
        .select('*')
        .in('user_id', userIds);

      if (settingsError) throw settingsError;

      // Get company settings for default values
      const { data: companySettings, error: companySettingsError } = await supabase
        .from('company_settings')
        .select('*')
        .in('company_id', profiles.map(p => p.company_id));

      if (companySettingsError) throw companySettingsError;

      // Process data by employee
      const processedData: PayrollData[] = profiles.map(profile => {
        const employeeTimesheets = (timesheets || []).filter(t => t.user_id === profile.user_id);
        const employeeAbsences = (absences || []).filter(a => a.user_id === profile.user_id);
        const settings = employeeSettings?.find(s => s.user_id === profile.user_id);
        
        const dailyData: { [day: string]: { ordinary: number; overtime: number; absence: string | null } } = {};
        let totalOrdinary = 0;
        let totalOvertime = 0;
        let totalAbsence = 0;
        let mealVoucherDays = 0;
        
        // Get meal voucher amount (employee settings take precedence over company settings)
        const companySettingsForEmployee = companySettings?.find(cs => cs.company_id === profile.company_id);
        const mealVoucherAmount = settings?.meal_voucher_amount || companySettingsForEmployee?.meal_voucher_amount || 8.00;

        // Initialize all days of the month
        const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
        }

        // Process timesheets
        employeeTimesheets.forEach(ts => {
          const day = new Date(ts.date).getDate();
          const dayKey = String(day).padStart(2, '0');
          
          const ordinary = Math.max(0, (ts.total_hours || 0) - (ts.overtime_hours || 0));
          const overtime = ts.overtime_hours || 0;
          
          dailyData[dayKey].ordinary = ordinary;
          dailyData[dayKey].overtime = overtime;
          
          totalOrdinary += ordinary;
          totalOvertime += overtime;
          
          // Calculate meal vouchers (simplified - if worked more than 6 hours)
          if ((ts.total_hours || 0) > 6) {
            mealVoucherDays++;
          }
        });

        // Process absences
        employeeAbsences.forEach(abs => {
          const day = new Date(abs.date).getDate();
          const dayKey = String(day).padStart(2, '0');
          
          dailyData[dayKey].absence = abs.absence_type;
          totalAbsence += abs.hours || 8;
        });

        return {
          employee_id: profile.user_id,
          employee_name: `${profile.first_name} ${profile.last_name}`,
          daily_data: dailyData,
          totals: { ordinary: totalOrdinary, overtime: totalOvertime, absence: totalAbsence },
          meal_vouchers: mealVoucherDays,
          meal_voucher_amount: mealVoucherAmount
        };
      });

      setPayrollData(processedData);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPayrollData();
    }
  }, [user, selectedMonth]);

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

  const getAbsenceTypeLabel = (type: string | null) => {
    if (!type) return '';
    const labels: { [key: string]: string } = {
      'ferie': 'F',
      'malattia': 'M',
      'infortunio': 'I',
      'permesso_non_retribuito': 'P'
    };
    return labels[type] || type.charAt(0).toUpperCase();
  };

  const exportToExcel = () => {
    const [year, month] = selectedMonth.split('-');
    const daysInMonth = getDaysInMonth();
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws: any = {};
    
    // Calculate Italian month name
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                       'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const monthName = monthNames[parseInt(month) - 1];
    
    // Create headers
    const headers = ['Dipendente'];
    
    // Add day headers with weekday names
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(parseInt(year), parseInt(month) - 1, day);
      const dayOfWeek = date.getDay();
      const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
      const dayName = dayNames[dayOfWeek];
      headers.push(`${day} ${dayName}`);
    }
    headers.push('Tot', 'Buoni Pasto');
    
    // Set headers in row 1
    headers.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      ws[cellAddress] = { v: header, t: 's' };
    });
    
    let currentRow = 1;
    
    // Add data rows (3 rows per employee)
    payrollData.forEach(employee => {
      // Ordinary hours row (O)
      const ordinaryRow = [`O - ${employee.employee_name}`];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
        ordinaryRow.push(ordinary > 0 ? ordinary.toFixed(1) : '');
      }
      ordinaryRow.push(employee.totals.ordinary.toFixed(1));
      ordinaryRow.push(employee.meal_vouchers > 0 ? 
        `${employee.meal_vouchers} x €${employee.meal_voucher_amount.toFixed(2)}` : '-');
      
      // Overtime hours row (S)
      const overtimeRow = [`S - ${employee.employee_name}`];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const overtime = employee.daily_data[dayKey]?.overtime || 0;
        overtimeRow.push(overtime > 0 ? overtime.toFixed(1) : '');
      }
      overtimeRow.push(employee.totals.overtime.toFixed(1));
      overtimeRow.push('-');
      
      // Absence row (N)
      const absenceRow = [`N - ${employee.employee_name}`];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const absence = employee.daily_data[dayKey]?.absence;
        absenceRow.push(absence ? getAbsenceTypeLabel(absence) : '');
      }
      absenceRow.push(employee.totals.absence.toFixed(1));
      absenceRow.push('-');
      
      // Add rows to worksheet
      [ordinaryRow, overtimeRow, absenceRow].forEach((row, rowOffset) => {
        row.forEach((cell, colIndex) => {
          const cellAddress = XLSX.utils.encode_cell({ r: currentRow + rowOffset, c: colIndex });
          ws[cellAddress] = { v: cell, t: typeof cell === 'number' ? 'n' : 's' };
        });
      });
      
      currentRow += 3;
    });
    
    // Set range
    const range = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: currentRow - 1, c: headers.length - 1 }
    });
    ws['!ref'] = range;
    
    // Set column widths
    const colWidths = [{ wch: 25 }]; // Employee name column
    for (let i = 1; i <= daysInMonth; i++) {
      colWidths.push({ wch: 8 }); // Day columns
    }
    colWidths.push({ wch: 10 }); // Tot column
    colWidths.push({ wch: 15 }); // Buoni Pasto column
    ws['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, `Buste Pago ${monthName} ${year}`);
    
    // Generate filename and save
    const fileName = `Buste_Pago_${monthName}_${year}.xlsx`;
    XLSX.writeFile(wb, fileName);
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-foreground">Vista Buste Paga</h3>
          <p className="text-sm text-muted-foreground">
            Riepilogo mensile per ufficio buste paga
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={exportToExcel}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Esporta Excel
          </Button>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
                {payrollData.reduce((sum, emp) => sum + emp.totals.ordinary, 0).toFixed(0)}h
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
                {payrollData.reduce((sum, emp) => sum + emp.totals.overtime, 0).toFixed(0)}h
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
            <CardDescription className="text-xs">
              O: Ordinarie | S: Straordinari | N: Assenze - Una riga per ogni tipologia
            </CardDescription>
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
                        {employee.totals.ordinary.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-yellow-50">
                        {employee.meal_vouchers > 0 ? (
                          <div className="flex flex-col">
                            <span>{employee.meal_vouchers}</span>
                            <span className="text-xs opacity-75">€{employee.meal_voucher_amount.toFixed(2)}</span>
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
                        {employee.totals.overtime.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                    </TableRow>

                    {/* Riga Assenze */}
                    <TableRow className="hover:bg-red-50/50">
                      <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs p-2 border-r">
                        <span className="text-red-700 font-bold">N</span> - {employee.employee_name}
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
                            {absence ? (
                              <span className="text-red-700 font-bold text-xs">
                                {getAbsenceTypeLabel(absence)}
                              </span>
                            ) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-red-700 text-xs p-1 bg-gray-50 border-l">
                        {employee.totals.absence.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compact Legend */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-xs">
          <div className="flex gap-4">
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
              <strong>A:</strong> Giorni di Assenza
            </span>
          </div>
          <div className="flex gap-4 text-muted-foreground">
            <span><strong>F:</strong> Ferie</span>
            <span><strong>M:</strong> Malattia</span>
            <span><strong>I:</strong> Infortunio</span>
            <span><strong>P:</strong> Permesso</span>
          </div>
        </div>
      </Card>
    </div>
  );
}