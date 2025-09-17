'use client'

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OvertimeConversionDialog } from '@/components/OvertimeConversionDialog';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { MealVoucherConversionService, MealVoucherConversion } from '@/services/MealVoucherConversionService';
import { DayConversionToggle } from '@/components/DayConversionToggle';

interface BusinessTripData {
  employee_id: string;
  employee_name: string;
  company_id: string;
  daily_data: { [day: string]: { ordinary: number; overtime: number; absence: string | null } };
  totals: { 
    ordinary: number; 
    overtime: number; 
    absence_totals: { [absenceType: string]: number };
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
  // Separate business trip types
  saturday_trips: {
    hours: number;
    amount: number;
    daily_data: { [day: string]: number }; // hours per day
  };
  daily_allowances: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean }; // true if allowance earned
  };
  overtime_conversions: {
    hours: number;
    amount: number;
    monthly_total: boolean; // true if has conversion for the month
  };
  meal_voucher_conversions: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean }; // true if converted
  };
}

const BusinessTripsDashboard = () => {
  const { user } = useAuth();
  const [businessTripData, setBusinessTripData] = useState<BusinessTripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [conversionDialog, setConversionDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    originalOvertimeHours: number;
  }>({
    open: false,
    userId: '',
    userName: '',
    originalOvertimeHours: 0
  });

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-');
    return new Date(parseInt(year), parseInt(month), 0).getDate();
  };

  const fetchBusinessTripData = async () => {
    try {
      setLoading(true);
      const [year, month] = selectedMonth.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

      // Multi-tenant safety: scope by current user's company
      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (meError) throw meError;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, company_id')
        .eq('is_active', true)
        .eq('company_id', me!.company_id);
      if (profilesError) throw profilesError;

      const profiles = profilesData || [];
      const userIds = profiles.map((p) => p.user_id);
      if (userIds.length === 0) {
        setBusinessTripData([]);
        return;
      }

      const { data: timesheets, error: timesheetError } = await supabase
        .from('timesheets')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false);
      if (timesheetError) throw timesheetError;

      const { data: absences, error: absenceError } = await supabase
        .from('employee_absences')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate);
      if (absenceError) throw absenceError;

      const { data: companySettings, error: companySettingsError } = await supabase
        .from('company_settings')
        .select('*')
        .in('company_id', profiles.map((p) => p.company_id));
      if (companySettingsError) throw companySettingsError;

      // Process automatic conversions once per company
      await OvertimeConversionService.processAutomaticConversions(selectedMonth, me!.company_id);

      // Import services
      const [{ getEmployeeSettingsForDate }, { BenefitsService }, { MealVoucherConversionService }] = await Promise.all([
        import('@/utils/temporalEmployeeSettings'),
        import('@/services/BenefitsService'),
        import('@/services/MealVoucherConversionService'),
      ]);

      // Load all meal voucher conversions for the period
      const allConversionsData = await MealVoucherConversionService.getConversionsForUsers(userIds, startDate, endDate);

      // Build simplified per-employee dataset
      const processedData: BusinessTripData[] = await Promise.all(
        profiles.map(async (profile) => {
          const employeeTimesheets = (timesheets || []).filter((t) => t.user_id === profile.user_id);
          const employeeAbsences = (absences || []).filter((a) => a.user_id === profile.user_id);
          const companySettingsForEmployee = companySettings?.find((cs) => cs.company_id === profile.company_id);
          const employeeConversions = allConversionsData[profile.user_id] || [];

          const dailyData: BusinessTripData['daily_data'] = {};
          let totalOrdinary = 0;
          let totalOvertime = 0;
          let absenceTotals: Record<string, number> = {};
          let mealVoucherDays = 0;

          // Initialize separate business trip types
          const saturdayTrips = {
            hours: 0,
            amount: 0,
            daily_data: {} as { [day: string]: number }
          };

          const dailyAllowances = {
            days: 0,
            amount: 0,
            daily_data: {} as { [day: string]: boolean }
          };

          const mealVoucherConversions = {
            days: 0,
            amount: 0,
            daily_data: {} as { [day: string]: boolean }
          };

          const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
            saturdayTrips.daily_data[dayKey] = 0;
            dailyAllowances.daily_data[dayKey] = false;
            mealVoucherConversions.daily_data[dayKey] = false;
          }

          const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
          const defaultMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.0;

          // Process timesheets - separate Saturday trips from regular work
          for (const ts of employeeTimesheets) {
            const day = new Date(`${ts.date}T00:00:00`).getDate();
            const dayKey = String(day).padStart(2, '0');
            const date = new Date(`${ts.date}T00:00:00`);
            const isSaturday = date.getDay() === 6;

            const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
            const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
            const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;

            if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
              // Saturday treated as business trip
              const hours = ts.total_hours || 0;
              saturdayTrips.hours += hours;
              saturdayTrips.amount += hours * effectiveSaturdayRate;
              saturdayTrips.daily_data[dayKey] = hours;
            } else {
              // Regular work day
              const overtime = ts.overtime_hours || 0;
              const ordinary = Math.max(0, (ts.total_hours || 0) - overtime);
              
              dailyData[dayKey].ordinary = ordinary;
              dailyData[dayKey].overtime = overtime;
              totalOrdinary += ordinary;
              totalOvertime += overtime;
            }

            // Calculate meal benefits (includes conversion logic)
            const mealBenefits = await BenefitsService.calculateMealBenefits(
              ts,
              temporalSettings ? {
                meal_allowance_policy: temporalSettings.meal_allowance_policy,
                meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
                daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
                lunch_break_type: temporalSettings.lunch_break_type,
                saturday_handling: temporalSettings.saturday_handling,
              } : undefined,
              companySettingsForEmployee,
              ts.date,
            );

            // Daily allowances
            if (mealBenefits.dailyAllowance) {
              dailyAllowances.days += 1;
              dailyAllowances.daily_data[dayKey] = true;
              const effectiveDailyAllowanceAmount = mealBenefits.dailyAllowanceAmount 
                || temporalSettings?.daily_allowance_amount 
                || companySettingsForEmployee?.default_daily_allowance_amount 
                || 10;
              dailyAllowances.amount += effectiveDailyAllowanceAmount;
            }

            // Count meal vouchers (not converted)
            if (mealBenefits.mealVoucher) mealVoucherDays++;

            // Track meal voucher conversions
            const isConverted = employeeConversions.some(conv => conv.date === ts.date && conv.converted_to_allowance);
            if (isConverted) {
              mealVoucherConversions.days += 1;
              mealVoucherConversions.daily_data[dayKey] = true;
              mealVoucherConversions.amount += defaultMealVoucherAmount;
            }
          }

          // Process absences
          for (const abs of employeeAbsences) {
            const day = new Date(`${abs.date}T00:00:00`).getDate();
            const dayKey = String(day).padStart(2, '0');
            dailyData[dayKey].absence = abs.absence_type;
            if (!absenceTotals[abs.absence_type]) absenceTotals[abs.absence_type] = 0;
            absenceTotals[abs.absence_type] += abs.hours || 8;
          }

          // Calculate overtime conversions (monthly)
          let overtimeConversions = {
            hours: 0,
            amount: 0,
            monthly_total: false
          };

          try {
            const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
              profile.user_id,
              selectedMonth,
              totalOvertime,
            );
            
            if (conversionCalc.converted_hours > 0) {
              overtimeConversions.hours = conversionCalc.converted_hours;
              overtimeConversions.amount = conversionCalc.conversion_amount;
              overtimeConversions.monthly_total = true;
              
              // Apply conversion to reduce displayed overtime
              totalOvertime = Math.max(0, totalOvertime - conversionCalc.converted_hours);
            }
          } catch (e) {
            console.warn('Conversion calc error', profile.user_id, e);
          }

          return {
            employee_id: profile.user_id,
            employee_name: `${profile.first_name} ${profile.last_name}`,
            company_id: profile.company_id,
            daily_data: dailyData,
            totals: {
              ordinary: totalOrdinary,
              overtime: totalOvertime,
              absence_totals: absenceTotals,
            },
            meal_vouchers: mealVoucherDays,
            meal_voucher_amount: mealVoucherDays * defaultMealVoucherAmount,
            saturday_trips: saturdayTrips,
            daily_allowances: dailyAllowances,
            overtime_conversions: overtimeConversions,
            meal_voucher_conversions: mealVoucherConversions,
          };
        })
      );

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

  const handleRefresh = () => {
    fetchBusinessTripData();
  };

  const handleOvertimeConversion = (userId: string, userName: string, originalOvertimeHours: number) => {
    setConversionDialog({
      open: true,
      userId,
      userName,
      originalOvertimeHours
    });
  };

  const handleConversionComplete = () => {
    setConversionDialog({ open: false, userId: '', userName: '', originalOvertimeHours: 0 });
    fetchBusinessTripData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
            <p className="text-muted-foreground">Panoramica dettagliata delle trasferte mensili</p>
          </div>
        </div>
        <div className="text-center py-12">Caricamento dati trasferte...</div>
      </div>
    );
  }

  // Calculate totals for summary cards
  const totalEmployees = businessTripData.length;
  const totalSaturdayHours = businessTripData.reduce((sum, emp) => sum + emp.saturday_trips.hours, 0);
  const totalSaturdayAmount = businessTripData.reduce((sum, emp) => sum + emp.saturday_trips.amount, 0);
  const totalDailyAllowanceDays = businessTripData.reduce((sum, emp) => sum + emp.daily_allowances.days, 0);
  const totalDailyAllowanceAmount = businessTripData.reduce((sum, emp) => sum + emp.daily_allowances.amount, 0);
  const totalOvertimeConversions = businessTripData.reduce((sum, emp) => sum + emp.overtime_conversions.amount, 0);
  const totalMealVoucherConversions = businessTripData.reduce((sum, emp) => sum + emp.meal_voucher_conversions.amount, 0);
  const grandTotal = totalSaturdayAmount + totalDailyAllowanceAmount + totalOvertimeConversions + totalMealVoucherConversions;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
          <p className="text-muted-foreground">Panoramica separata per tipologia di trasferta</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Selezione mese" />
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
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <p className="text-xs text-muted-foreground">Dipendenti attivi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trasferte Sabato</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalSaturdayAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{totalSaturdayHours.toFixed(1)} ore totali</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indennità Giornaliere</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalDailyAllowanceAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{totalDailyAllowanceDays} giorni</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Generale</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{grandTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Incluse tutte le tipologie</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio Trasferte per Dipendente</CardTitle>
          <CardDescription>
            Struttura semplificata con righe separate per tipologia
          </CardDescription>
        </CardHeader>
        <CardContent>
          {businessTripData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun dato disponibile per il mese selezionato
            </div>
          ) : (
            <TooltipProvider>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Dipendente</TableHead>
                      <TableHead className="min-w-[120px]">Tipo</TableHead>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => (
                        <TableHead key={i + 1} className="w-8 text-center text-xs">
                          {i + 1}
                        </TableHead>
                      ))}
                      <TableHead className="text-right min-w-[80px]">Totale</TableHead>
                      <TableHead className="text-right min-w-[100px]">Buoni Pasto</TableHead>
                      <TableHead className="text-right min-w-[100px]">Importo</TableHead>
                      <TableHead className="min-w-[120px]">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businessTripData.map((employee) => (
                      <React.Fragment key={employee.employee_id}>
                        {/* Ordinary hours row */}
                        <TableRow>
                          <TableCell className="font-medium">{employee.employee_name}</TableCell>
                          <TableCell className="text-sm text-blue-600">Ordinarie</TableCell>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
                            return (
                              <TableCell key={i + 1} className="text-center text-xs">
                                {ordinary > 0 ? ordinary.toFixed(1) : ''}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-medium">
                            {employee.totals.ordinary.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">
                            {employee.meal_vouchers > 0 
                              ? `${employee.meal_vouchers} (€${employee.meal_voucher_amount.toFixed(2)})`
                              : ''
                            }
                          </TableCell>
                          <TableCell className="text-right">€0.00</TableCell>
                          <TableCell></TableCell>
                        </TableRow>

                        {/* Overtime hours row */}
                        <TableRow>
                          <TableCell></TableCell>
                          <TableCell className="text-sm text-amber-600">Straordinarie</TableCell>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const overtime = employee.daily_data[dayKey]?.overtime || 0;
                            return (
                              <TableCell key={i + 1} className="text-center text-xs">
                                {overtime > 0 ? overtime.toFixed(1) : ''}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-medium">
                            {employee.totals.overtime.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right"></TableCell>
                          <TableCell className="text-right">€0.00</TableCell>
                          <TableCell>
                            {employee.totals.overtime > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOvertimeConversion(
                                  employee.employee_id,
                                  employee.employee_name,
                                  employee.totals.overtime + employee.overtime_conversions.hours
                                )}
                              >
                                Conversioni
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Absence rows */}
                        {Object.entries(employee.totals.absence_totals).map(([absenceType, hours]) => (
                          hours > 0 && (
                            <TableRow key={`${employee.employee_id}-${absenceType}`}>
                              <TableCell></TableCell>
                              <TableCell className="text-sm text-gray-600">{absenceType}</TableCell>
                              {Array.from({ length: getDaysInMonth() }, (_, i) => {
                                const dayKey = String(i + 1).padStart(2, '0');
                                const absence = employee.daily_data[dayKey]?.absence;
                                return (
                                  <TableCell key={i + 1} className="text-center text-xs">
                                    {absence === absenceType ? absence.charAt(0).toUpperCase() : ''}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-right font-medium">
                                {hours.toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right"></TableCell>
                              <TableCell className="text-right">€0.00</TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          )
                        ))}

                        {/* Saturday trips row */}
                        {employee.saturday_trips.hours > 0 && (
                          <TableRow className="bg-orange-50">
                            <TableCell></TableCell>
                            <TableCell className="text-sm font-medium text-orange-700">TS - Trasferte Sabato</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const hours = employee.saturday_trips.daily_data[dayKey] || 0;
                              return (
                                <TableCell key={i + 1} className="text-center text-xs font-medium">
                                  {hours > 0 ? hours.toFixed(1) : ''}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-bold text-orange-700">
                              {employee.saturday_trips.hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-bold text-orange-700">
                              €{employee.saturday_trips.amount.toFixed(2)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}

                        {/* Daily allowances row */}
                        {employee.daily_allowances.days > 0 && (
                          <TableRow className="bg-blue-50">
                            <TableCell></TableCell>
                            <TableCell className="text-sm font-medium text-blue-700">TI - Trasferte Indennità</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const hasAllowance = employee.daily_allowances.daily_data[dayKey];
                              return (
                                <TableCell key={i + 1} className="text-center text-xs font-medium">
                                  {hasAllowance ? 'TI' : ''}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-bold text-blue-700">
                              {employee.daily_allowances.days}
                            </TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-bold text-blue-700">
                              €{employee.daily_allowances.amount.toFixed(2)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}

                        {/* Overtime conversions row */}
                        {employee.overtime_conversions.hours > 0 && (
                          <TableRow className="bg-green-50">
                            <TableCell></TableCell>
                            <TableCell className="text-sm font-medium text-green-700">CS - Conversioni Straordinari</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => (
                              <TableCell key={i + 1} className="text-center text-xs">
                                {i === 0 ? 'Mensile' : ''}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-bold text-green-700">
                              {employee.overtime_conversions.hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-bold text-green-700">
                              €{employee.overtime_conversions.amount.toFixed(2)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}

                        {/* Meal voucher conversions row */}
                        {employee.meal_voucher_conversions.days > 0 && (
                          <TableRow className="bg-purple-50">
                            <TableCell></TableCell>
                            <TableCell className="text-sm font-medium text-purple-700">CB - Conversioni Buoni Pasto</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const isConverted = employee.meal_voucher_conversions.daily_data[dayKey];
                              return (
                                <TableCell key={i + 1} className="text-center text-xs font-medium">
                                  {isConverted ? 'CB' : ''}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-bold text-purple-700">
                              {employee.meal_voucher_conversions.days}
                            </TableCell>
                            <TableCell className="text-right"></TableCell>
                            <TableCell className="text-right font-bold text-purple-700">
                              €{employee.meal_voucher_conversions.amount.toFixed(2)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}

                        {/* Separator row */}
                        <TableRow>
                          <TableCell colSpan={getDaysInMonth() + 6} className="h-2 border-b-2 border-gray-200"></TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Legenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-200 rounded"></div>
              <span><strong>TS</strong> - Trasferte Sabato</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-200 rounded"></div>
              <span><strong>TI</strong> - Trasferte Indennità</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-200 rounded"></div>
              <span><strong>CS</strong> - Conversioni Straordinari</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-200 rounded"></div>
              <span><strong>CB</strong> - Conversioni Buoni Pasto</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            <p>• Ogni tipologia di trasferta è ora separata in righe distinte</p>
            <p>• I calcoli sono semplificati e più trasparenti</p>
            <p>• Il totale generale è la somma diretta delle tipologie</p>
          </div>
        </CardContent>
      </Card>

      <OvertimeConversionDialog
        open={conversionDialog.open}
        onOpenChange={(open) => setConversionDialog(prev => ({ ...prev, open }))}
        userId={conversionDialog.userId}
        userName={conversionDialog.userName}
        month={selectedMonth}
        originalOvertimeHours={conversionDialog.originalOvertimeHours}
        onSuccess={handleConversionComplete}
      />
    </div>
  );
};

export default BusinessTripsDashboard;