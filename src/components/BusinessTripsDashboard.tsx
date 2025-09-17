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
import { distributeConvertedOvertime, applyOvertimeDistribution } from '@/utils/overtimeDistribution';

interface BusinessTripData {
  employee_id: string;
  employee_name: string;
  company_id: string;
  daily_data: { [day: string]: { ordinary: number; overtime: number; absence: string | null; business_trip: boolean; business_trip_hours: number } };
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
      overtime_conversion_hours: number;
      overtime_conversion_amount: number;
    };
    standardized_business_trip_days: number;
    daily_business_trip_rate: number;
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
}

const BusinessTripsDashboard = () => {
  const { user } = useAuth();
  const [businessTripData, setBusinessTripData] = useState<BusinessTripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [allConversions, setAllConversions] = useState<{[key: string]: MealVoucherConversion[]}>({});
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

  // Italian holidays for any year with dynamic Easter calculation
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
      `${year}-11-13`, // San Omobono (Cremona)
    ]);
    
    // Calculate Easter for any year using Gregorian algorithm
    const calculateEaster = (year: number) => {
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
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      
      return new Date(year, month - 1, day);
    };
    
    const easter = calculateEaster(year);
    const easterMonth = String(easter.getMonth() + 1).padStart(2, '0');
    const easterDay = String(easter.getDate()).padStart(2, '0');
    const easterMonday = new Date(easter);
    easterMonday.setDate(easter.getDate() + 1);
    const easterMondayMonth = String(easterMonday.getMonth() + 1).padStart(2, '0');
    const easterMondayDay = String(easterMonday.getDate()).padStart(2, '0');
    
    holidays.add(`${year}-${easterMonth}-${easterDay}`); // Pasqua
    holidays.add(`${year}-${easterMondayMonth}-${easterMondayDay}`); // Lunedì dell'Angelo
    
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
      assenza_ingiustificata: 'A',
      ferie: 'F',
      festivita: 'FS',
      infortunio: 'I',
      malattia: 'M',
      permesso_retribuito: 'PR',
      permesso_non_retribuito: 'PNR',
    };
    return labels[type] || type.charAt(0).toUpperCase();
  };

  // -------- Excel Export (dynamic import) --------
  const exportToExcel = async () => {
    const ExcelJS: any = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trasferte');

    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    worksheet.addRow([`Trasferte e Indennità - ${monthName}`]);
    worksheet.addRow([]);

    const headers = ['Dipendente', 'Tipo'];
    const daysInMonth = getDaysInMonth();
    for (let day = 1; day <= daysInMonth; day++) headers.push(String(day));
    headers.push('Totale', 'Buoni Pasto', 'Importo Trasferte', 'Giorni Trasferta', '€/Giorno', 'Conversioni');
    worksheet.addRow(headers);

    businessTripData.forEach((employee) => {
      const ordinaryRow: any[] = [employee.employee_name, 'Ordinarie'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
        ordinaryRow.push(ordinary > 0 ? ordinary.toFixed(1) : '');
      }
      ordinaryRow.push(employee.totals.ordinary.toFixed(1));
      ordinaryRow.push(
        employee.meal_vouchers > 0 ? `${employee.meal_vouchers} (€${employee.meal_voucher_amount.toFixed(2)})` : ''
      );
      ordinaryRow.push(''); // Imp. Tot.
      ordinaryRow.push(''); // Gg Tr.
      ordinaryRow.push(''); // €/G
      ordinaryRow.push(''); // Conversioni
      worksheet.addRow(ordinaryRow);

      const overtimeRow: any[] = [employee.employee_name, 'Straordinarie'];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        const overtime = employee.daily_data[dayKey]?.overtime || 0;
        overtimeRow.push(overtime > 0 ? overtime.toFixed(1) : '');
      }
      overtimeRow.push(employee.totals.overtime.toFixed(1));
      overtimeRow.push(''); // Buoni
      overtimeRow.push(''); // Imp. Tot.
      overtimeRow.push(''); // Gg Tr.
      overtimeRow.push(''); // €/G
      overtimeRow.push(''); // Conversioni
      worksheet.addRow(overtimeRow);

      (Object.entries(employee.totals.absence_totals) as [string, number][])?.forEach(([absenceType, hours]) => {
        if (hours > 0) {
          const absenceRow: any[] = [employee.employee_name, absenceType];
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            const absence = employee.daily_data[dayKey]?.absence;
            absenceRow.push(absence === absenceType ? getAbsenceTypeLabel(absence) : '');
          }
          absenceRow.push(hours.toFixed(1));
          absenceRow.push(''); // Buoni
          absenceRow.push(''); // Imp. Tot.
          absenceRow.push(''); // Gg Tr.
          absenceRow.push(''); // €/G
          absenceRow.push(''); // Conversioni
          worksheet.addRow(absenceRow);
        }
      });

      if (employee.totals.business_trip_hours > 0) {
        const businessTripRow: any[] = [employee.employee_name, 'Trasferte'];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          const isBusinessTrip = employee.daily_data[dayKey]?.business_trip;
          businessTripRow.push(isBusinessTrip ? 'T' : '');
        }
        businessTripRow.push(employee.totals.business_trip_hours.toFixed(1)); // Totale
        businessTripRow.push(''); // Buoni
        businessTripRow.push(`€${employee.totals.business_trip_amount.toFixed(2)}`); // Imp. Tot.
        businessTripRow.push(employee.totals.standardized_business_trip_days.toString()); // Gg Tr.
        businessTripRow.push(`€${employee.totals.daily_business_trip_rate.toFixed(2)}`); // €/G
        businessTripRow.push(''); // Conversioni
        worksheet.addRow(businessTripRow);
      }
    });

    worksheet.getRow(1).font = { bold: true, size: 14 } as any;
    worksheet.getRow(3).font = { bold: true } as any;
    worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } } as any;

    worksheet.columns?.forEach((col: any) => (col.width = 12));
    worksheet.getColumn(1).width = 25;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trasferte-${monthName.replace(/\s+/g, '-')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // -------- Data fetch & processing --------
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

      // Process automatic conversions once per company - pass selectedMonth format (YYYY-MM)
      await OvertimeConversionService.processAutomaticConversions(selectedMonth, me!.company_id);

      // Import temporal funcs once
      const [{ getEmployeeSettingsForDate }, { calculateMealBenefitsTemporal }, { BenefitsService }, { MealVoucherConversionService }] = await Promise.all([
        import('@/utils/temporalEmployeeSettings'),
        import('@/utils/mealBenefitsCalculator'),
        import('@/services/BenefitsService'),
        import('@/services/MealVoucherConversionService'),
      ]);

      // Carica tutte le conversioni buoni pasto per il periodo
      const allConversionsData = await MealVoucherConversionService.getConversionsForUsers(userIds, startDate, endDate);
      setAllConversions(allConversionsData);

      // Build per-employee dataset
      const processedData: BusinessTripData[] = await Promise.all(
        profiles.map(async (profile) => {
          const employeeTimesheets = (timesheets || []).filter((t) => t.user_id === profile.user_id);
          const employeeAbsences = (absences || []).filter((a) => a.user_id === profile.user_id);
          const companySettingsForEmployee = companySettings?.find((cs) => cs.company_id === profile.company_id);
          const employeeConversions = allConversionsData[profile.user_id] || [];
          const conversionMap = MealVoucherConversionService.createConversionMap(employeeConversions);

          const dailyData: BusinessTripData['daily_data'] = {};
          let totalOrdinary = 0;
          let totalOvertime = 0;
          let absenceTotals: Record<string, number> = {};
          let mealVoucherDays = 0;
          let businessTripHours = 0;
          let saturdayHours = 0;
          let saturdayAmount = 0;
          let dailyAllowanceDays = 0;
          let dailyAllowanceAmount = 0;

          const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null, business_trip: false, business_trip_hours: 0 };
          }

          const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
          let defaultMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.0;

          for (const ts of employeeTimesheets) {
            const day = new Date(`${ts.date}T00:00:00`).getDate(); // timezone-safe
            const dayKey = String(day).padStart(2, '0');
            const date = new Date(`${ts.date}T00:00:00`);
            const isSaturday = date.getDay() === 6;

            const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
            const effectiveSaturdayHandling =
              temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
            const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;
            const temporalMealVoucherAmount = temporalSettings?.meal_voucher_amount || defaultMealVoucherAmount;

            let overtime = ts.overtime_hours || 0;
            let isBusinessTrip = false;
            if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
              overtime = 0; // No overtime on Saturday if treated as trip
              isBusinessTrip = true;
              const tot = ts.total_hours || 0;
              businessTripHours += tot;
              saturdayHours += tot;
              saturdayAmount += tot * effectiveSaturdayRate;
            }

            const mealBenefits = await calculateMealBenefitsTemporal(
              ts,
              temporalSettings
                ? {
                    meal_allowance_policy: temporalSettings.meal_allowance_policy,
                    meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
                    daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
                    lunch_break_type: temporalSettings.lunch_break_type,
                  }
                : undefined,
              companySettingsForEmployee,
              ts.date,
            );

            if (mealBenefits.dailyAllowance) {
              dailyAllowanceDays += 1;
              // Usa l'importo specifico dal meal benefits (che considera le conversioni)
              const effectiveDailyAllowanceAmount = mealBenefits.dailyAllowanceAmount 
                || temporalSettings?.daily_allowance_amount 
                || companySettingsForEmployee?.default_daily_allowance_amount 
                || 10;
              dailyAllowanceAmount += effectiveDailyAllowanceAmount;
            }
            if (mealBenefits.mealVoucher) mealVoucherDays++;
            if (temporalMealVoucherAmount && temporalMealVoucherAmount !== defaultMealVoucherAmount) {
              defaultMealVoucherAmount = temporalMealVoucherAmount;
            }

            const ordinary = isBusinessTrip ? 0 : Math.max(0, (ts.total_hours || 0) - overtime);
            dailyData[dayKey].ordinary = ordinary;
            dailyData[dayKey].overtime = overtime;
            dailyData[dayKey].business_trip = isBusinessTrip;
            dailyData[dayKey].business_trip_hours = isBusinessTrip ? ts.total_hours || 0 : 0;

            totalOrdinary += ordinary;
            totalOvertime += overtime;
          }

          for (const abs of employeeAbsences) {
            const day = new Date(`${abs.date}T00:00:00`).getDate();
            const dayKey = String(day).padStart(2, '0');
            dailyData[dayKey].absence = abs.absence_type;
            if (!absenceTotals[abs.absence_type]) absenceTotals[abs.absence_type] = 0;
            absenceTotals[abs.absence_type] += abs.hours || 8;
          }

          const totalBusinessTripAmount = saturdayAmount + dailyAllowanceAmount;

          // Conversions
          let overtimeConversionHours = 0;
          let overtimeConversionAmount = 0;
          try {
            const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
              profile.user_id,
              selectedMonth,
              totalOvertime,
            );
            overtimeConversionHours = conversionCalc.converted_hours;
            overtimeConversionAmount = conversionCalc.conversion_amount;

            if (conversionCalc.converted_hours > 0) {
              const distributions = distributeConvertedOvertime(dailyData, conversionCalc.converted_hours);
              const updatedDailyData = applyOvertimeDistribution(dailyData, distributions);
              Object.assign(dailyData, updatedDailyData);
              totalOvertime = Object.values(dailyData).reduce((sum, d) => sum + (d.overtime || 0), 0);
            }
          } catch (e) {
            console.warn('Conversion calc error', profile.user_id, e);
          }

          let finalBusinessTripAmount = totalBusinessTripAmount + overtimeConversionAmount;

          // Working days constraint
          const { calculateWorkingDays } = await import('@/utils/workingDaysCalculator');
          const workingDaysResult = await calculateWorkingDays(profile.user_id, selectedMonth, employeeTimesheets);

          let standardizedBusinessTripDays = 0;
          let dailyBusinessTripRate = 0;
          let constrainedOvertimeConversionHours = overtimeConversionHours;
          let constrainedOvertimeConversionAmount = overtimeConversionAmount;

          if (finalBusinessTripAmount > 0) {
            const temporalSettings = await getEmployeeSettingsForDate(profile.user_id, `${selectedMonth}-01`);
            const testTimesheet = employeeTimesheets.find((ts) => {
              const d = new Date(`${ts.date}T00:00:00`);
              return d.getDay() !== 6 && ts.total_hours && ts.total_hours > 0;
            });

            // Calcola il tasso di business trip basato sui meal benefits giornalieri
            // Considera sia i benefits normali che le conversioni specifiche per giorno
            let daysWithMealVoucher = 0;
            let totalWorkingDays = 0;
            
            for (const ts of employeeTimesheets) {
              const date = new Date(`${ts.date}T00:00:00`);
              if (date.getDay() === 6) continue; // Skip Saturdays per business trips
              
              const temporalSettingsForDay = await getEmployeeSettingsForDate(ts.user_id, ts.date);
              
              // Check if this specific day is converted to allowance
              const isConvertedToAllowance = conversionMap[ts.date] === true;
              
              if (!isConvertedToAllowance) {
                const mealBenefits = await BenefitsService.calculateMealBenefits(
                  ts,
                  temporalSettingsForDay
                    ? {
                        meal_allowance_policy: temporalSettingsForDay.meal_allowance_policy,
                        meal_voucher_min_hours: temporalSettingsForDay.meal_voucher_min_hours,
                        daily_allowance_min_hours: temporalSettingsForDay.daily_allowance_min_hours,
                        lunch_break_type: temporalSettingsForDay.lunch_break_type,
                        saturday_handling: temporalSettingsForDay.saturday_handling,
                      }
                    : undefined,
                  companySettingsForEmployee,
                  ts.date,
                );
                
                if (mealBenefits.mealVoucher) {
                  daysWithMealVoucher++;
                }
              }
              // Se convertito, non conta come day with meal voucher
              
              totalWorkingDays++;
            }
            
            // Calcola tasso medio pesato
            // Se la maggior parte dei giorni ha meal voucher (e non sono convertiti), usa rateWithMeal
            // Altrimenti usa rateWithoutMeal
            const hasMealBenefits = totalWorkingDays > 0 && (daysWithMealVoucher / totalWorkingDays) > 0.5;

            const rateWithMeal =
              temporalSettings?.business_trip_rate_with_meal || companySettingsForEmployee?.business_trip_rate_with_meal || 30.98;
            const rateWithoutMeal =
              temporalSettings?.business_trip_rate_without_meal || companySettingsForEmployee?.business_trip_rate_without_meal || 46.48;
            const maxDailyValue = hasMealBenefits ? rateWithMeal : rateWithoutMeal;

            const unconstrainedDays = Math.ceil(finalBusinessTripAmount / maxDailyValue);
            const maxAllowedDays = workingDaysResult.actualWorkingDays;

            if (unconstrainedDays > maxAllowedDays) {
              standardizedBusinessTripDays = maxAllowedDays;
              const maxAllowableAmount = maxAllowedDays * maxDailyValue;
              const fixedAmount = totalBusinessTripAmount;
              if (maxAllowableAmount < fixedAmount) {
                constrainedOvertimeConversionAmount = 0;
                constrainedOvertimeConversionHours = 0;
                finalBusinessTripAmount = fixedAmount;
              } else {
                const availableForConversion = maxAllowableAmount - fixedAmount;
                constrainedOvertimeConversionAmount = Math.min(overtimeConversionAmount, availableForConversion);
                if (overtimeConversionAmount > 0) {
                  constrainedOvertimeConversionHours =
                    overtimeConversionHours * (constrainedOvertimeConversionAmount / overtimeConversionAmount);
                }
                finalBusinessTripAmount = fixedAmount + constrainedOvertimeConversionAmount;
              }

              if (constrainedOvertimeConversionAmount < overtimeConversionAmount) {
                try {
                  const hoursDelta = constrainedOvertimeConversionHours - overtimeConversionHours;
                  if (Math.abs(hoursDelta) > 0.01) {
                    await OvertimeConversionService.applyManualConversion(
                      profile.user_id,
                      selectedMonth,
                      hoursDelta,
                      `Ridotto automaticamente per rispettare limite giorni lavorati (${maxAllowedDays} giorni)`,
                    );
                  }
                } catch (e) {
                  console.warn('Constraint apply error', e);
                }
              }

              dailyBusinessTripRate = finalBusinessTripAmount / standardizedBusinessTripDays;
            } else {
              standardizedBusinessTripDays = unconstrainedDays;
              dailyBusinessTripRate = finalBusinessTripAmount / standardizedBusinessTripDays;
            }
          }

          // Adjusted business trip hours (post-constraint)
          let adjustedBusinessTripHours = businessTripHours + constrainedOvertimeConversionHours;
          if (finalBusinessTripAmount > 0 && standardizedBusinessTripDays > 0) {
            const temporalSettings = await getEmployeeSettingsForDate(profile.user_id, `${selectedMonth}-01`);
            const testTimesheet = employeeTimesheets.find((ts) => {
              const d = new Date(`${ts.date}T00:00:00`);
              return d.getDay() !== 6 && ts.total_hours && ts.total_hours > 0;
            });
            // Calcola il tasso di business trip basato sui meal benefits giornalieri (anche per adjusted hours)
            let daysWithMealVoucherAdjusted = 0;
            let totalWorkingDaysAdjusted = 0;
            
            for (const ts of employeeTimesheets) {
              const date = new Date(`${ts.date}T00:00:00`);
              if (date.getDay() === 6) continue; // Skip Saturdays per business trips
              
              const temporalSettingsForDay = await getEmployeeSettingsForDate(ts.user_id, ts.date);
              const isConvertedToAllowance = conversionMap[ts.date] === true;
              
              if (!isConvertedToAllowance) {
                const mealBenefits = await BenefitsService.calculateMealBenefits(
                  ts,
                  temporalSettingsForDay
                    ? {
                        meal_allowance_policy: temporalSettingsForDay.meal_allowance_policy,
                        meal_voucher_min_hours: temporalSettingsForDay.meal_voucher_min_hours,
                        daily_allowance_min_hours: temporalSettingsForDay.daily_allowance_min_hours,
                        lunch_break_type: temporalSettingsForDay.lunch_break_type,
                        saturday_handling: temporalSettingsForDay.saturday_handling,
                      }
                    : undefined,
                  companySettingsForEmployee,
                  ts.date,
                );
                
                if (mealBenefits.mealVoucher) {
                  daysWithMealVoucherAdjusted++;
                }
              }
              
              totalWorkingDaysAdjusted++;
            }
            
            const hasMealBenefits = totalWorkingDaysAdjusted > 0 && (daysWithMealVoucherAdjusted / totalWorkingDaysAdjusted) > 0.5;
            const rateWithMeal =
              temporalSettings?.business_trip_rate_with_meal || companySettingsForEmployee?.business_trip_rate_with_meal || 30.98;
            const rateWithoutMeal =
              temporalSettings?.business_trip_rate_without_meal || companySettingsForEmployee?.business_trip_rate_without_meal || 46.48;
            const maxDailyValue = hasMealBenefits ? rateWithMeal : rateWithoutMeal;

            const originalUnconstrainedAmount = totalBusinessTripAmount + overtimeConversionAmount;
            const originalUnconstrainedDays = Math.ceil(originalUnconstrainedAmount / maxDailyValue);
            if (originalUnconstrainedDays > standardizedBusinessTripDays) {
              const ratio = standardizedBusinessTripDays / originalUnconstrainedDays;
              adjustedBusinessTripHours = (businessTripHours + overtimeConversionHours) * ratio;
            }
          }

          // Add back non-converted hours
          const nonConvertedHours = overtimeConversionHours - constrainedOvertimeConversionHours;
          if (nonConvertedHours > 0.005) {
            totalOvertime += nonConvertedHours;
            const entries = Object.entries(dailyData).filter(([, d]) => d.overtime && d.overtime > 0);
            const totalRemain = entries.reduce((s, [, d]) => s + (d.overtime || 0), 0);
            if (totalRemain > 0) {
              for (const [dkey, d] of entries) {
                const prop = d.overtime / totalRemain;
                dailyData[dkey].overtime = d.overtime + nonConvertedHours * prop;
              }
            }
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
              business_trip_hours: adjustedBusinessTripHours,
              business_trip_amount: finalBusinessTripAmount,
              business_trip_breakdown: {
                saturday_hours: saturdayHours,
                saturday_amount: saturdayAmount,
                daily_allowance_days: dailyAllowanceDays,
                daily_allowance_amount: dailyAllowanceAmount,
                overtime_conversion_hours: constrainedOvertimeConversionHours,
                overtime_conversion_amount: constrainedOvertimeConversionAmount,
              },
              standardized_business_trip_days: standardizedBusinessTripDays,
              daily_business_trip_rate: dailyBusinessTripRate,
            },
            meal_vouchers: mealVoucherDays,
            meal_voucher_amount: defaultMealVoucherAmount,
          };
        }),
      );

      setBusinessTripData(processedData);
    } catch (error) {
      console.error('Error fetching business trip data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ---- Parte 2 di 2: lifecycle + UI + export ----

  useEffect(() => {
    if (user) {
      fetchBusinessTripData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <TooltipProvider>
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
                        month: 'long',
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
                <Button variant="outline" size="sm" onClick={fetchBusinessTripData}>
                  Aggiorna
                </Button>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
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
                {businessTripData
                  .reduce((sum, emp) => sum + emp.totals.business_trip_hours, 0)
                  .toFixed(1)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Totale Importo Trasferte</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                €
                {businessTripData
                  .reduce((sum, emp) => sum + emp.totals.business_trip_amount, 0)
                  .toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Giorni Indennità</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {businessTripData
                  .reduce(
                    (sum, emp) => sum + emp.totals.business_trip_breakdown.daily_allowance_days,
                    0
                  )}
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
            <div className="overflow-x-auto max-w-[calc(100vw-2rem)] lg:max-w-none">
              <div className="overflow-y-auto max-h-[600px]">
                <Table className="text-xs min-w-fit">
                  <TableHeader className="sticky top-0 bg-background z-20">
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-30 w-40 min-w-[10rem] text-xs font-medium border-r">
                        Dipendente
                      </TableHead>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => {
                        const day = i + 1;
                        const date = new Date(
                          parseInt(selectedMonth.split('-')[0]),
                          parseInt(selectedMonth.split('-')[1]) - 1,
                          day
                        );
                        const dayOfWeek = date.getDay();
                        const dayNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
                        const dayName = dayNames[dayOfWeek];
                        const isHol = isHoliday(day);
                        const isSun = isSunday(day);

                        return (
                          <TableHead
                            key={day}
                            className={`text-center w-9 min-w-[2.25rem] text-xs font-medium px-1 ${
                              isHol || isSun ? 'bg-red-50' : ''
                            } ${dayOfWeek === 6 ? 'bg-orange-50' : ''}`}
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-xs leading-none">{day}</span>
                              <span className="text-[10px] font-normal opacity-75 leading-none">
                                {dayName}
                              </span>
                            </div>
                          </TableHead>
                        );
                      })}
                      <TableHead className="text-center w-10 min-w-[2.5rem] text-xs font-medium bg-gray-50 border-l px-1">
                        Tot
                      </TableHead>
                      <TableHead className="text-center w-12 min-w-[3rem] text-xs font-medium bg-yellow-50 px-1">
                        Buoni
                      </TableHead>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-16 min-w-[4rem] text-xs font-medium bg-orange-50 px-1">
                            Imp. Tot.
                          </TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Importo totale trasferte</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-12 min-w-[3rem] text-xs font-medium bg-orange-50 px-1">
                            Gg Tr.
                          </TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Giorni trasferta normalizzati</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-12 min-w-[3rem] text-xs font-medium bg-orange-50 px-1">
                            €/G
                          </TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Importo giornaliero trasferte</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-12 min-w-[3rem] text-xs font-medium bg-green-50 px-1">
                            Conv.
                          </TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Gestione conversioni straordinari</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-12 min-w-[3rem] text-xs font-medium bg-purple-50 px-1">
                            BP/IND
                          </TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Conversione Buoni Pasto ↔ Indennità</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {businessTripData.map((employee) => (
                      <React.Fragment key={employee.employee_id}>
                        {/* Ordinary Hours Row */}
                        <TableRow className="hover:bg-green-50/50">
                          <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
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
                                className={`text-center px-0.5 py-1 text-xs ${
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
                                <span className="text-xs opacity-75">
                                  €{employee.meal_voucher_amount.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-green-50">-</TableCell>
                        </TableRow>

                        {/* Overtime Hours Row */}
                        <TableRow className="hover:bg-blue-50/50">
                          <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
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
                                className={`text-center px-0.5 py-1 text-xs ${
                                  isHol || isSun ? 'bg-red-50' : ''
                                } ${overtime > 0 ? 'text-blue-700 font-medium' : 'text-muted-foreground'}`}
                              >
                                {overtime > 0 ? overtime.toFixed(1) : ''}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center font-bold text-blue-700 text-xs px-1 py-1 bg-gray-50 border-l">
                            {employee.totals.overtime.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-center text-xs px-1 py-1 bg-yellow-50">-</TableCell>
                          <TableCell className="text-center text-xs px-1 py-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs px-1 py-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs px-1 py-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs px-1 py-1 bg-green-50">-</TableCell>
                        </TableRow>

                        {/* Dynamic Absence Rows */}
                        {Object.entries(employee.totals.absence_totals).map(([absenceType, hours]) =>
                          hours > 0 ? (
                            <TableRow key={`${employee.employee_id}-${absenceType}`} className="hover:bg-red-50/50">
                              <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
                                <span className="text-red-700 font-bold">{getAbsenceTypeLabel(absenceType)}</span> -{' '}
                                {employee.employee_name}
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
                                    className={`text-center px-0.5 py-1 text-xs ${isHol || isSun ? 'bg-red-50' : ''}`}
                                  >
                                    {absence === absenceType ? (
                                      <span className="text-red-700 font-bold text-xs">
                                        {getAbsenceTypeLabel(absence)}
                                      </span>
                                    ) : (
                                      ''
                                    )}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center font-bold text-red-700 text-xs p-1 bg-gray-50 border-l">
                                {Number(hours).toFixed(1)}
                              </TableCell>
                              <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                              <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                              <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                              <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                              <TableCell className="text-center text-xs p-1 bg-green-50">-</TableCell>
                            </TableRow>
                          ) : null
                        )}

                        {/* Business Trip Row */}
                        {employee.totals.business_trip_hours > 0 && (
                          <TableRow className="hover:bg-orange-50/50">
                            <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
                              <span className="text-orange-700 font-bold">T</span> - {employee.employee_name}
                            </TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const day = i + 1;
                              const dayKey = String(day).padStart(2, '0');
                              const isBusinessTrip = employee.daily_data[dayKey]?.business_trip;
                              const businessTripHours = employee.daily_data[dayKey]?.business_trip_hours || 0;
                              const isHol = isHoliday(day);
                              const isSun = isSunday(day);

                              return (
                                <TableCell
                                  key={day}
                                  className={`text-center px-0.5 py-1 text-xs ${
                                    isHol || isSun ? 'bg-red-50' : ''
                                  } ${isBusinessTrip ? 'bg-orange-100' : ''}`}
                                >
                                  {isBusinessTrip ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-orange-700 font-bold text-xs cursor-help">T</span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Ore trasferta: {businessTripHours.toFixed(1)}h</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    ''
                                  )}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center font-bold text-orange-700 text-xs p-1 bg-gray-50 border-l">
                              {employee.totals.business_trip_hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
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
                              <TooltipContent className="max-w-xs z-[100]" side="top" sideOffset={10} align="center" avoidCollisions>
                                <div className="space-y-1 text-xs">
                                  <p className="font-semibold">Dettaglio calcolo:</p>
                                  {employee.totals.business_trip_breakdown.saturday_hours > 0 && (
                                    <p>
                                      Sabati: {employee.totals.business_trip_breakdown.saturday_hours.toFixed(1)}h × tariffa = €
                                      {employee.totals.business_trip_breakdown.saturday_amount.toFixed(2)}
                                    </p>
                                  )}
                                  {employee.totals.business_trip_breakdown.daily_allowance_days > 0 && (
                                    <p>
                                      Indennità: {employee.totals.business_trip_breakdown.daily_allowance_days} giorni × €
                                      {(
                                        employee.totals.business_trip_breakdown.daily_allowance_amount /
                                        employee.totals.business_trip_breakdown.daily_allowance_days
                                      ).toFixed(2)}{' '}
                                      = €{employee.totals.business_trip_breakdown.daily_allowance_amount.toFixed(2)}
                                    </p>
                                  )}
                                  {employee.totals.business_trip_breakdown.overtime_conversion_hours > 0 && (
                                    <p>
                                      Conversioni: {employee.totals.business_trip_breakdown.overtime_conversion_hours.toFixed(1)}h ×
                                      tariffa = €{employee.totals.business_trip_breakdown.overtime_conversion_amount.toFixed(2)}
                                    </p>
                                  )}
                                  <p className="font-semibold pt-1 border-t">Totale: €{employee.totals.business_trip_amount.toFixed(2)}</p>
                                  <p className="font-semibold text-blue-600 pt-1 border-t">
                                    Normalizzazione: {employee.totals.standardized_business_trip_days} gg × €
                                    {employee.totals.daily_business_trip_rate.toFixed(2)}/gg
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            <TableCell className="text-center text-xs p-1 bg-orange-50">
                              <span className="font-bold text-blue-600">
                                {employee.totals.standardized_business_trip_days}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-xs p-1 bg-blue-50">
                              <span className="font-bold text-blue-600">
                                €{employee.totals.daily_business_trip_rate.toFixed(2)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-xs p-1 bg-green-50">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConversionDialog({
                                    open: true,
                                    userId: employee.employee_id,
                                    userName: employee.employee_name,
                                    originalOvertimeHours: employee.totals.overtime,
                                  })
                                }
                                className="h-6 px-2 text-xs"
                              >
                                <TrendingDown className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )}

                        {/* Meal Voucher Conversion Row */}
                        <TableRow className="hover:bg-purple-50/50 border-t border-dashed">
                          <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
                            <span className="text-purple-700 font-bold">BP</span> - {employee.employee_name}
                          </TableCell>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const day = i + 1;
                            const dayKey = String(day).padStart(2, '0');
                            const [year, month] = selectedMonth.split('-');
                            const dateString = `${year}-${month}-${dayKey}`;
                            const hasData = employee.daily_data[dayKey] && (
                              (employee.daily_data[dayKey].ordinary || 0) > 0 ||
                              (employee.daily_data[dayKey].overtime || 0) > 0
                            );
                            const isHol = isHoliday(day);
                            const isSun = isSunday(day);
                            const isConvertedToAllowance = allConversions[employee.employee_id]?.some(
                              conv => conv.date === dateString && conv.converted_to_allowance
                            ) || false;

                            return (
                              <TableCell
                                key={day}
                                className={`text-center px-0.5 py-1 text-xs ${
                                  isHol || isSun ? 'bg-red-50' : ''
                                }`}
                              >
                                {hasData ? (
                                  <div className="flex justify-center">
                                    <DayConversionToggle
                                      userId={employee.employee_id}
                                      userName={employee.employee_name}
                                      date={dateString}
                                      companyId={employee.company_id}
                                      isConverted={isConvertedToAllowance}
                                      onConversionUpdated={fetchBusinessTripData}
                                      size="sm"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center text-xs p-1 bg-gray-50 border-l">
                            <div className="flex flex-col items-center text-xs">
                              <span className="text-purple-700 font-bold">
                                {allConversions[employee.employee_id]?.filter(c => c.converted_to_allowance).length || 0}
                              </span>
                              <span className="text-gray-500 text-xs">conv.</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-xs p-1 bg-yellow-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-blue-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-green-50">-</TableCell>
                          <TableCell className="text-center text-xs p-1 bg-purple-50">
                            <div className="flex flex-col items-center text-xs">
                              <span className="text-green-600 font-bold">
                                {allConversions[employee.employee_id]?.length || 0}
                              </span>
                              <span className="text-gray-500 text-xs">tot</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-6 text-xs">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-100 border border-green-300 rounded" />
                <strong>O:</strong> Ore Ordinarie
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded" />
                <strong>S:</strong> Ore Straordinario
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-100 border border-red-300 rounded" />
                <strong>N:</strong> Giorni di Assenza
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded" />
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

        {/* Overtime Conversion Dialog */}
        <OvertimeConversionDialog
          open={conversionDialog.open}
          onOpenChange={(open) => setConversionDialog((prev) => ({ ...prev, open }))}
          userId={conversionDialog.userId}
          userName={conversionDialog.userName}
          month={selectedMonth}
          originalOvertimeHours={conversionDialog.originalOvertimeHours}
          onSuccess={() => {
            fetchBusinessTripData();
          }}
        />
      </div>
    </TooltipProvider>
  );
};

export default BusinessTripsDashboard;