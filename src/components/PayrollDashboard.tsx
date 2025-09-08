import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PayrollData {
  employee_id: string;
  employee_name: string;
  daily_data: { [day: string]: { ordinary: number; overtime: number; absence: string | null } };
  totals: { ordinary: number; overtime: number; absence: number };
  meal_vouchers: number;
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
          meal_vouchers: mealVoucherDays
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-foreground">Vista Buste Paga</h3>
          <p className="text-muted-foreground">
            Riepilogo mensile per ufficio buste paga
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const label = date.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
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
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payrollData.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Ordinarie Totali</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payrollData.reduce((sum, emp) => sum + emp.totals.ordinary, 0).toFixed(1)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Straordinario Totali</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {payrollData.reduce((sum, emp) => sum + emp.totals.overtime, 0).toFixed(1)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio Mensile</CardTitle>
          <CardDescription>
            Ore lavorate per dipendente - O: Ordinarie, S: Straordinari, N: Assenze
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Dipendente</TableHead>
                  {Array.from({ length: getDaysInMonth() }, (_, i) => {
                    const day = i + 1;
                    const isHol = isHoliday(day);
                    const isSun = isSunday(day);
                    return (
                      <TableHead 
                        key={day} 
                        className={`text-center min-w-16 ${
                          isHol || isSun ? 'bg-red-50 text-red-700' : ''
                        }`}
                      >
                        {day}
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-center">Tot O</TableHead>
                  <TableHead className="text-center">Tot S</TableHead>
                  <TableHead className="text-center">Tot N</TableHead>
                  <TableHead className="text-center">Buoni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollData.map((employee) => (
                  <React.Fragment key={employee.employee_id}>
                    {/* Ordinary Hours Row */}
                    <TableRow>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        O - {employee.employee_name}
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
                            className={`text-center ${
                              isHol || isSun ? 'bg-red-50' : ''
                            }`}
                          >
                            {ordinary > 0 ? ordinary.toFixed(1) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-medium">
                        {employee.totals.ordinary.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center font-medium">
                        {employee.meal_vouchers}
                      </TableCell>
                    </TableRow>

                    {/* Overtime Hours Row */}
                    <TableRow>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        S - {employee.employee_name}
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
                            className={`text-center ${
                              isHol || isSun ? 'bg-red-50' : ''
                            }`}
                          >
                            {overtime > 0 ? overtime.toFixed(1) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center font-medium">
                        {employee.totals.overtime.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center">-</TableCell>
                    </TableRow>

                    {/* Absence Hours Row */}
                    <TableRow>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        N - {employee.employee_name}
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
                            className={`text-center ${
                              isHol || isSun ? 'bg-red-50' : ''
                            }`}
                          >
                            {absence ? (
                              <Badge variant="secondary" className="text-xs">
                                {getAbsenceTypeLabel(absence)}
                              </Badge>
                            ) : ''}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center">-</TableCell>
                      <TableCell className="text-center font-medium">
                        {employee.totals.absence.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">-</TableCell>
                    </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Legenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <p><strong>O:</strong> Ore Ordinarie</p>
              <p><strong>S:</strong> Ore Straordinario</p>
              <p><strong>N:</strong> Ore di Assenza</p>
            </div>
            <div className="space-y-1">
              <p><strong>F:</strong> Ferie</p>
              <p><strong>M:</strong> Malattia</p>
              <p><strong>I:</strong> Infortunio</p>
              <p><strong>P:</strong> Permesso non retribuito</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-red-50 rounded-md">
            <p className="text-sm text-red-700">
              <strong>Giorni in evidenza:</strong> Festività e domeniche
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}