import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as ExcelJS from 'exceljs';

interface BusinessTripData {
  employee_id: string;
  employee_name: string;
  daily_data: { [day: string]: { ordinary: number; overtime: number; absence: string | null; business_trip: boolean } };
  totals: { 
    ordinary: number; 
    overtime: number; 
    absence_totals: { [absenceType: string]: number };
    business_trip_hours: number;
    business_trip_amount: number;
    business_trip_breakdown: {
      saturday_hours: number;
      saturday_amount: number;
      daily_allowance_days: number;
      daily_allowance_amount: number;
    };
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
}

const BusinessTripsDashboard = () => {
  const { user } = useAuth();
  const [businessTripData, setBusinessTripData] = useState<BusinessTripData[]>([]);
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

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trasferte');

    // Add title
    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    worksheet.addRow([`Trasferte e Indennità - ${monthName}`]);
    worksheet.addRow([]);

    // Headers
    const headers = ['Dipendente', 'Tipo'];
    const daysInMonth = getDaysInMonth();
    for (let day = 1; day <= daysInMonth; day++) {
      headers.push(String(day));
    }
    headers.push('Totale', 'Buoni Pasto', 'Trasferte');
    worksheet.addRow(headers);

    // Data rows
    businessTripData.forEach(employee => {
      // Ordinary hours row
      const ordinaryRow = [employee.employee_name, 'Ordinarie'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
        ordinaryRow.push(ordinary > 0 ? ordinary.toFixed(1) : '');
      }
      ordinaryRow.push(employee.totals.ordinary.toFixed(1));
      ordinaryRow.push(employee.meal_vouchers > 0 ? `${employee.meal_vouchers} (€${employee.meal_voucher_amount.toFixed(2)})` : '');
      ordinaryRow.push('');
      worksheet.addRow(ordinaryRow);

      // Overtime hours row
      const overtimeRow = [employee.employee_name, 'Straordinarie'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const overtime = employee.daily_data[dayKey]?.overtime || 0;
        overtimeRow.push(overtime > 0 ? overtime.toFixed(1) : '');
      }
      overtimeRow.push(employee.totals.overtime.toFixed(1));
      overtimeRow.push('');
      overtimeRow.push('');
      worksheet.addRow(overtimeRow);

      // Absence rows
      Object.entries(employee.totals.absence_totals).forEach(([absenceType, hours]) => {
        if (hours > 0) {
          const absenceRow = [employee.employee_name, absenceType];
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            const absence = employee.daily_data[dayKey]?.absence;
            absenceRow.push(absence === absenceType ? getAbsenceTypeLabel(absence) : '');
          }
          absenceRow.push(hours.toFixed(1));
          absenceRow.push('');
          absenceRow.push('');
          worksheet.addRow(absenceRow);
        }
      });

      // Business trip row
      if (employee.totals.business_trip_hours > 0) {
        const businessTripRow = [employee.employee_name, 'Trasferte'];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          const isBusinessTrip = employee.daily_data[dayKey]?.business_trip;
          businessTripRow.push(isBusinessTrip ? 'T' : '');
        }
        businessTripRow.push(employee.totals.business_trip_hours.toFixed(1));
        businessTripRow.push('');
        businessTripRow.push(`€${employee.totals.business_trip_amount.toFixed(2)} (${employee.totals.business_trip_hours.toFixed(1)}h)`);
        worksheet.addRow(businessTripRow);
      }
    });

    // Style the worksheet
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(3).font = { bold: true };
    worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 12;
    });
    worksheet.getColumn(1).width = 25; // Employee name column

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trasferte-${monthName.replace(' ', '-')}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const fetchBusinessTripData = async () => {
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
        setBusinessTripData([]);
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

      // Get employee settings for business trip calculation
      const { data: employeeSettings, error: settingsError } = await supabase
        .from('employee_settings')
        .select('*')
        .in('user_id', userIds)
        .order('updated_at', { ascending: false });

      if (settingsError) throw settingsError;

      // Get company settings for default values
      const { data: companySettings, error: companySettingsError } = await supabase
        .from('company_settings')
        .select('*')
        .in('company_id', profiles.map(p => p.company_id));

      if (companySettingsError) throw companySettingsError;

      // Process data by employee
      const processedData: BusinessTripData[] = profiles.map(profile => {
        const employeeTimesheets = (timesheets || []).filter(t => t.user_id === profile.user_id);
        const employeeAbsences = (absences || []).filter(a => a.user_id === profile.user_id);
        const settings = employeeSettings?.find(s => s.user_id === profile.user_id && s.company_id === profile.company_id) || 
                        employeeSettings?.find(s => s.user_id === profile.user_id);
        const companySettingsForEmployee = companySettings?.find(cs => cs.company_id === profile.company_id);
        
        const dailyData: { [day: string]: { ordinary: number; overtime: number; absence: string | null; business_trip: boolean } } = {};
        let totalOrdinary = 0;
        let totalOvertime = 0;
        let absenceTotals: { [absenceType: string]: number } = {};
        let mealVoucherDays = 0;
        let businessTripHours = 0;
        let saturdayHours = 0;
        let saturdayAmount = 0;
        let dailyAllowanceDays = 0;
        let dailyAllowanceAmount = 0;
        
        // Get employee settings with company defaults
        const effectiveSaturdayHandling = settings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
        const effectiveMealAllowancePolicy = (settings as any)?.meal_allowance_policy || (companySettingsForEmployee as any)?.meal_allowance_policy || 'disabled';
        const effectiveDailyAllowanceMinHours = settings?.daily_allowance_min_hours || (companySettingsForEmployee as any)?.default_daily_allowance_min_hours || 6;
        const effectiveDailyAllowanceAmount = settings?.daily_allowance_amount || (companySettingsForEmployee as any)?.default_daily_allowance_amount || 10;
        const effectiveSaturdayRate = settings?.saturday_hourly_rate || companySettingsForEmployee?.saturday_hourly_rate || 10;
        const mealVoucherAmount = settings?.meal_voucher_amount || companySettingsForEmployee?.meal_voucher_amount || 8.00;
        
        console.log(`BusinessTripsDashboard - ${profile.first_name} ${profile.last_name}:`, {
          employeeMealAllowancePolicy: (settings as any)?.meal_allowance_policy,
          companyMealAllowancePolicy: (companySettingsForEmployee as any)?.meal_allowance_policy,
          effectiveMealAllowancePolicy: effectiveMealAllowancePolicy,
          saturdayHandling: effectiveSaturdayHandling,
          dailyAllowanceAmount: effectiveDailyAllowanceAmount,
          dailyAllowanceMinHours: effectiveDailyAllowanceMinHours
        });

        // Initialize all days of the month
        const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null, business_trip: false };
        }

        // Process timesheets
        employeeTimesheets.forEach(ts => {
          const day = new Date(ts.date).getDate();
          const dayKey = String(day).padStart(2, '0');
          const date = new Date(ts.date);
          const isSaturday = date.getDay() === 6;
          
          let overtime = ts.overtime_hours || 0;
          let isBusinessTrip = false;
          
          // Check if Saturday is handled as business trip
          if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
            overtime = 0; // Don't count as overtime
            isBusinessTrip = true;
            businessTripHours += ts.total_hours || 0;
            saturdayHours += ts.total_hours || 0;
            saturdayAmount += (ts.total_hours || 0) * effectiveSaturdayRate;
          }
          
          // Check for daily allowance eligibility
          if (effectiveMealAllowancePolicy === 'daily_allowance' && (ts.total_hours || 0) >= effectiveDailyAllowanceMinHours) {
            // For daily allowance policy, count all qualifying days including Saturday business trips
            dailyAllowanceDays += 1;
            dailyAllowanceAmount += effectiveDailyAllowanceAmount;
          }
          
          const ordinary = Math.max(0, (ts.total_hours || 0) - overtime);
          
          dailyData[dayKey].ordinary = ordinary;
          dailyData[dayKey].overtime = overtime;
          dailyData[dayKey].business_trip = isBusinessTrip;
          
          totalOrdinary += ordinary;
          totalOvertime += overtime;
          
          // Calculate meal vouchers based on unified policy
          // Daily allowance policy means no meal vouchers (they're mutually exclusive)
          if (effectiveMealAllowancePolicy === 'disabled' || effectiveMealAllowancePolicy === 'daily_allowance') {
            // No meal vouchers earned if disabled or using daily allowance
          } else if (effectiveMealAllowancePolicy === 'meal_vouchers_only') {
            if ((ts.total_hours || 0) > 6) {
              mealVoucherDays++;
            }
          } else if (effectiveMealAllowancePolicy === 'meal_vouchers_always') {
            mealVoucherDays++;
          }
        });

        // Process absences
        employeeAbsences.forEach(abs => {
          const day = new Date(abs.date).getDate();
          const dayKey = String(day).padStart(2, '0');
          
          dailyData[dayKey].absence = abs.absence_type;
          
          // Track hours by absence type
          const absenceType = abs.absence_type;
          if (!absenceTotals[absenceType]) {
            absenceTotals[absenceType] = 0;
          }
          absenceTotals[absenceType] += abs.hours || 8;
        });

        const totalBusinessTripAmount = saturdayAmount + dailyAllowanceAmount;

        return {
          employee_id: profile.user_id,
          employee_name: `${profile.first_name} ${profile.last_name}`,
          daily_data: dailyData,
          totals: { 
            ordinary: totalOrdinary, 
            overtime: totalOvertime, 
            absence_totals: absenceTotals,
            business_trip_hours: businessTripHours,
            business_trip_amount: totalBusinessTripAmount,
            business_trip_breakdown: {
              saturday_hours: saturdayHours,
              saturday_amount: saturdayAmount,
              daily_allowance_days: dailyAllowanceDays,
              daily_allowance_amount: dailyAllowanceAmount,
            }
          },
          meal_vouchers: mealVoucherDays,
          meal_voucher_amount: mealVoucherAmount
        };
      });

      setBusinessTripData(processedData);
    } catch (error) {
      console.error('Error fetching business trip data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBusinessTripData();
    }
  }, [user, selectedMonth]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Caricamento dati trasferte...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Trasferte e Indennità</h1>
          <p className="text-muted-foreground">
            Gestione trasferte, sabati e indennità giornaliere
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - i);
                    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const label = date.toLocaleDateString('it-IT', { 
                      year: 'numeric', 
                      month: 'long' 
                    });
                    return (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={fetchBusinessTripData}
              >
                Aggiorna
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={exportToExcel}
              >
                <Download className="w-4 h-4 mr-2" />
                Esporta
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {businessTripData.length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Totale Ore Trasferta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-orange-600" />
              {businessTripData.reduce((sum, emp) => sum + emp.totals.business_trip_hours, 0).toFixed(1)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Totale Importo Trasferte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              €{businessTripData.reduce((sum, emp) => sum + emp.totals.business_trip_amount, 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Giorni Indennità</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {businessTripData.reduce((sum, emp) => sum + emp.totals.business_trip_breakdown.daily_allowance_days, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Dettaglio Trasferte per Dipendente
          </CardTitle>
          <CardDescription>
            Ore ordinarie, straordinarie, assenze, trasferte e buoni pasto per ciascun dipendente
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[600px]">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 bg-background z-20">
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-30 w-48 min-w-48 text-xs font-medium border-r">
                    Dipendente
                  </TableHead>
                  {Array.from({ length: getDaysInMonth() }, (_, i) => {
                    const day = i + 1;
                    const date = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1, day);
                    const dayOfWeek = date.getDay();
                    const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
                    const dayName = dayNames[dayOfWeek];
                    const isHol = isHoliday(day);
                    const isSun = isSunday(day);
                    
                    return (
                      <TableHead 
                        key={day} 
                        className={`text-center w-12 min-w-12 text-xs font-medium ${
                          isHol || isSun ? 'bg-red-50' : ''
                        } ${dayOfWeek === 6 ? 'bg-orange-50' : ''}`}
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TableHead className="text-center w-20 min-w-20 text-xs font-medium bg-orange-50">Trasferte</TableHead>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Ore e importo totale trasferte</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessTripData.map((employee) => (
                  <React.Fragment key={employee.employee_id}>
                    {/* Ordinary Hours Row */}
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
                        const isBusinessTrip = employee.daily_data[dayKey]?.business_trip;
                        
                        return (
                          <TableCell 
                            key={day} 
                            className={`text-center p-1 text-xs ${
                              isHol || isSun ? 'bg-red-50' : ''
                            } ${isBusinessTrip ? 'bg-orange-50' : ''} ${
                              ordinary > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'
                            }`}
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
                      <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                    </TableRow>

                    {/* Overtime Hours Row */}
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
                      <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                    </TableRow>

                    {/* Dynamic Absence Rows */}
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
                            <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          </TableRow>
                        );
                      }
                      return null;
                    })}

                    {/* Business Trip Row */}
                    {employee.totals.business_trip_hours > 0 && (
                      <TableRow className="hover:bg-orange-50/50">
                        <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs p-2 border-r">
                          <span className="text-orange-700 font-bold">T</span> - {employee.employee_name}
                        </TableCell>
                        {Array.from({ length: getDaysInMonth() }, (_, i) => {
                          const day = i + 1;
                          const dayKey = String(day).padStart(2, '0');
                          const isBusinessTrip = employee.daily_data[dayKey]?.business_trip;
                          const isHol = isHoliday(day);
                          const isSun = isSunday(day);
                          
                          return (
                            <TableCell 
                              key={day} 
                              className={`text-center p-1 text-xs ${
                                isHol || isSun ? 'bg-red-50' : ''
                              } ${isBusinessTrip ? 'bg-orange-100' : ''}`}
                            >
                              {isBusinessTrip ? (
                                <span className="text-orange-700 font-bold text-xs">T</span>
                              ) : ''}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-bold text-orange-700 text-xs p-1 bg-gray-50 border-l">
                          {employee.totals.business_trip_hours.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <TableCell className="text-center text-xs p-1 bg-orange-50 cursor-help">
                                <div className="flex flex-col">
                                  <span className="font-bold text-orange-700">
                                    €{employee.totals.business_trip_amount.toFixed(2)}
                                  </span>
                                  <span className="text-xs opacity-75">
                                    {employee.totals.business_trip_hours.toFixed(1)}h
                                  </span>
                                </div>
                              </TableCell>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <div className="space-y-1 text-xs">
                                <p className="font-semibold">Dettaglio calcolo:</p>
                                {employee.totals.business_trip_breakdown.saturday_hours > 0 && (
                                  <p>
                                    Sabati: {employee.totals.business_trip_breakdown.saturday_hours.toFixed(1)}h × tariffa = 
                                    €{employee.totals.business_trip_breakdown.saturday_amount.toFixed(2)}
                                  </p>
                                )}
                                {employee.totals.business_trip_breakdown.daily_allowance_days > 0 && (
                                  <p>
                                    Indennità: {employee.totals.business_trip_breakdown.daily_allowance_days} giorni × 
                                    €{(employee.totals.business_trip_breakdown.daily_allowance_amount / employee.totals.business_trip_breakdown.daily_allowance_days).toFixed(2)} = 
                                    €{employee.totals.business_trip_breakdown.daily_allowance_amount.toFixed(2)}
                                  </p>
                                )}
                                <p className="font-semibold pt-1 border-t">
                                  Totale: €{employee.totals.business_trip_amount.toFixed(2)}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Legend */}
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
            <span className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded"></div>
              <strong>T:</strong> Trasferte/Sabati
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
    </div>
  );
};

export default BusinessTripsDashboard;