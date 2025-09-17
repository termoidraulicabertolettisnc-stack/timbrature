import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OvertimeConversionDialog } from '@/components/OvertimeConversionDialog';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { distributeConvertedOvertime, applyOvertimeDistribution } from '@/utils/overtimeDistribution';
import * as ExcelJS from 'exceljs';
import { calculateMealBenefits } from '@/utils/mealBenefitsCalculator';

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
    headers.push('Totale', 'Buoni Pasto', 'Importo Trasferte', 'Giorni Trasferta', '€/Giorno', 'Conversioni');
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
              ordinaryRow.push('');
              ordinaryRow.push('');
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
              overtimeRow.push('');
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
                  absenceRow.push('');
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
                businessTripRow.push(`€${employee.totals.business_trip_amount.toFixed(2)}`);
                businessTripRow.push(employee.totals.standardized_business_trip_days.toString());
                businessTripRow.push(`€${employee.totals.daily_business_trip_rate.toFixed(2)}`);
                businessTripRow.push(''); // Conversioni column
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

      // Process data by employee using temporal settings
      const processedData: BusinessTripData[] = await Promise.all(profiles.map(async (profile) => {
        const employeeTimesheets = (timesheets || []).filter(t => t.user_id === profile.user_id);
        const employeeAbsences = (absences || []).filter(a => a.user_id === profile.user_id);
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

        console.log(`BusinessTripsDashboard - Processing ${profile.first_name} ${profile.last_name}`);

        // Initialize all days of the month
        const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = String(day).padStart(2, '0');
          dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null, business_trip: false };
        }

        // Default values from company settings
        const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
        let defaultMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.00;

        // Process timesheets with temporal settings
        for (const ts of employeeTimesheets) {
          const day = new Date(ts.date).getDate();
          const dayKey = String(day).padStart(2, '0');
          const date = new Date(ts.date);
          const isSaturday = date.getDay() === 6;
          
          // Get temporal employee settings for this specific date
          const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
          const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
          
          // Use temporal settings or fallback to company defaults
          const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
          const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;
          const temporalMealVoucherAmount = temporalSettings?.meal_voucher_amount || defaultMealVoucherAmount;
          
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
          
          // Calculate meal benefits using temporal calculation
          const { calculateMealBenefitsTemporal } = await import('@/utils/mealBenefitsCalculator');
          const mealBenefits = await calculateMealBenefitsTemporal(
            ts,
            temporalSettings ? {
              meal_allowance_policy: temporalSettings.meal_allowance_policy,
              meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
              daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
              lunch_break_type: temporalSettings.lunch_break_type
            } : undefined,
            companySettingsForEmployee,
            ts.date
          );
          
          // Count daily allowance days
          if (mealBenefits.dailyAllowance) {
            dailyAllowanceDays += 1;
            const effectiveDailyAllowanceAmount = temporalSettings?.daily_allowance_amount || 
                                                 companySettingsForEmployee?.default_daily_allowance_amount || 10;
            dailyAllowanceAmount += effectiveDailyAllowanceAmount;
          }
          
          // Count meal voucher days
          if (mealBenefits.mealVoucher) {
            mealVoucherDays++;
          }
          
          // Update meal voucher amount if needed
          if (temporalMealVoucherAmount && temporalMealVoucherAmount !== defaultMealVoucherAmount) {
            defaultMealVoucherAmount = temporalMealVoucherAmount;
          }
          
          const ordinary = Math.max(0, (ts.total_hours || 0) - overtime);
          
          dailyData[dayKey].ordinary = ordinary;
          dailyData[dayKey].overtime = overtime;
          dailyData[dayKey].business_trip = isBusinessTrip;
          
          totalOrdinary += ordinary;
          totalOvertime += overtime;
        }

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

        // Apply overtime conversion with proportional distribution
        let overtimeConversionHours = 0;
        let overtimeConversionAmount = 0;
        
        try {
          // First, process automatic conversions for this user if needed
          await OvertimeConversionService.processUserAutomaticConversion(profile.user_id, selectedMonth);
          
          // Then get the conversion details (now including any automatic conversions)
          const conversionCalc = await OvertimeConversionService.calculateConversionDetails(
            profile.user_id,
            selectedMonth,
            totalOvertime
          );
          overtimeConversionHours = conversionCalc.converted_hours;
          overtimeConversionAmount = conversionCalc.conversion_amount;
          
          // Distribute converted hours proportionally if there are conversions
          if (conversionCalc.converted_hours > 0) {
            const distributions = distributeConvertedOvertime(
              dailyData,
              conversionCalc.converted_hours
            );
            
            const updatedDailyData = applyOvertimeDistribution(
              dailyData,
              distributions
            );
            
            // Update the dailyData reference
            Object.assign(dailyData, updatedDailyData);

            // Recalculate total overtime after distribution
            totalOvertime = Object.values(dailyData)
              .reduce((sum, day) => sum + (day.overtime || 0), 0);
          }
        } catch (error) {
          console.warn('Error calculating overtime conversion for employee', profile.user_id, error);
        }

        let finalBusinessTripAmount = totalBusinessTripAmount + overtimeConversionAmount;

        // Calculate working days constraint
        const { calculateWorkingDays } = await import('@/utils/workingDaysCalculator');
        const workingDaysResult = await calculateWorkingDays(profile.user_id, selectedMonth, employeeTimesheets);
        
        // Calculate standardized business trip days and daily rate with working days constraint
        let standardizedBusinessTripDays = 0;
        let dailyBusinessTripRate = 0;
        let constrainedOvertimeConversionHours = overtimeConversionHours;
        let constrainedOvertimeConversionAmount = overtimeConversionAmount;
        
        if (finalBusinessTripAmount > 0) {
          // Determine the maximum daily business trip value for this employee
          // Use the same logic as meal benefits calculation to determine the correct rate
          const { BenefitsService } = await import('@/services/BenefitsService');
          const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
          
          // Get temporal settings for this employee
          const temporalSettings = await getEmployeeSettingsForDate(profile.user_id, `${selectedMonth}-01`);
          
          // Find a regular working day for this employee to test meal benefit eligibility
          const testTimesheet = employeeTimesheets.find(ts => {
            const date = new Date(ts.date);
            return date.getDay() !== 6 && ts.total_hours && ts.total_hours > 0; // Not Saturday and has worked hours
          });
          
          let hasMealBenefits = false;
          if (testTimesheet) {
            // Use the same BenefitsService logic to determine if employee has meal benefits
            const mealBenefits = await BenefitsService.calculateMealBenefits(
              testTimesheet,
              temporalSettings ? {
                meal_allowance_policy: temporalSettings.meal_allowance_policy,
                meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
                daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
                lunch_break_type: temporalSettings.lunch_break_type,
                saturday_handling: temporalSettings.saturday_handling
              } : undefined,
              companySettingsForEmployee,
              testTimesheet.date
            );
            hasMealBenefits = mealBenefits.mealVoucher;
          }
          
          // Determine rates
          const rateWithMeal = temporalSettings?.business_trip_rate_with_meal || companySettingsForEmployee?.business_trip_rate_with_meal || 30.98;
          const rateWithoutMeal = temporalSettings?.business_trip_rate_without_meal || companySettingsForEmployee?.business_trip_rate_without_meal || 46.48;
          
          // Use appropriate rate based on actual meal benefit eligibility (same logic as rest of app)
          const maxDailyValue = hasMealBenefits ? rateWithMeal : rateWithoutMeal;
          
          // Calculate unconstrained business trip days
          const unconstrainedBusinessTripDays = Math.ceil(finalBusinessTripAmount / maxDailyValue);
          
          // Apply working days constraint
          const maxAllowedBusinessTripDays = workingDaysResult.actualWorkingDays;
          
          if (unconstrainedBusinessTripDays > maxAllowedBusinessTripDays) {
            console.log(`BusinessTripsDashboard - Employee ${profile.first_name} ${profile.last_name}: Constraining business trip days from ${unconstrainedBusinessTripDays} to ${maxAllowedBusinessTripDays}`);
            
            // Constrain business trip days to actual working days
            standardizedBusinessTripDays = maxAllowedBusinessTripDays;
            
            // Calculate the maximum allowable business trip amount
            const maxAllowableAmount = maxAllowedBusinessTripDays * maxDailyValue;
            
            // If the overtime conversion amount pushes us over the limit, reduce it
            const fixedAmount = totalBusinessTripAmount;
            if (maxAllowableAmount < fixedAmount) {
              // This shouldn't happen as Saturday amounts + allowances should be within limits
              // But if it does, keep the fixed amounts and reduce overtime conversion to 0
              constrainedOvertimeConversionAmount = 0;
              constrainedOvertimeConversionHours = 0;
              finalBusinessTripAmount = fixedAmount;
            } else {
              // Reduce overtime conversion amount to fit within constraint
              const availableForConversion = maxAllowableAmount - fixedAmount;
              constrainedOvertimeConversionAmount = Math.min(overtimeConversionAmount, availableForConversion);
              
              // Calculate proportional hours reduction
              if (overtimeConversionAmount > 0) {
                constrainedOvertimeConversionHours = overtimeConversionHours * (constrainedOvertimeConversionAmount / overtimeConversionAmount);
              }
              
              finalBusinessTripAmount = fixedAmount + constrainedOvertimeConversionAmount;
            }
            
            // Update overtime conversion if it was reduced
            if (constrainedOvertimeConversionAmount < overtimeConversionAmount) {
              try {
                // Apply the constraint by adjusting the manual conversion
                const hoursDelta = constrainedOvertimeConversionHours - overtimeConversionHours;
                if (Math.abs(hoursDelta) > 0.01) { // Only update if there's a meaningful difference
                  await OvertimeConversionService.applyManualConversion(
                    profile.user_id,
                    selectedMonth,
                    hoursDelta,
                    `Ridotto automaticamente per rispettare limite giorni lavorati (${maxAllowedBusinessTripDays} giorni)`
                  );
                }
              } catch (error) {
                console.warn('Error applying working days constraint to overtime conversion:', error);
              }
            }
            
            // Calculate constrained daily rate
            dailyBusinessTripRate = finalBusinessTripAmount / standardizedBusinessTripDays;
          } else {
            // No constraint needed
            standardizedBusinessTripDays = unconstrainedBusinessTripDays;
            dailyBusinessTripRate = finalBusinessTripAmount / standardizedBusinessTripDays;
          }
        }

        // Calculate adjusted business trip hours based on constrained days
        let adjustedBusinessTripHours = businessTripHours + constrainedOvertimeConversionHours;
        
        // If we had to constrain the business trip days, we need to proportionally adjust the total hours
        if (finalBusinessTripAmount > 0 && standardizedBusinessTripDays > 0) {
          // Calculate the original unconstrained days for comparison
          const { BenefitsService } = await import('@/services/BenefitsService');
          const { getEmployeeSettingsForDate } = await import('@/utils/temporalEmployeeSettings');
          
          const temporalSettings = await getEmployeeSettingsForDate(profile.user_id, `${selectedMonth}-01`);
          const testTimesheet = employeeTimesheets.find(ts => {
            const date = new Date(ts.date);
            return date.getDay() !== 6 && ts.total_hours && ts.total_hours > 0;
          });
          
          let hasMealBenefits = false;
          if (testTimesheet) {
            const mealBenefits = await BenefitsService.calculateMealBenefits(
              testTimesheet,
              temporalSettings ? {
                meal_allowance_policy: temporalSettings.meal_allowance_policy,
                meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
                daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
                lunch_break_type: temporalSettings.lunch_break_type,
                saturday_handling: temporalSettings.saturday_handling
              } : undefined,
              companySettingsForEmployee,
              testTimesheet.date
            );
            hasMealBenefits = mealBenefits.mealVoucher;
          }
          
          const rateWithMeal = temporalSettings?.business_trip_rate_with_meal || companySettingsForEmployee?.business_trip_rate_with_meal || 30.98;
          const rateWithoutMeal = temporalSettings?.business_trip_rate_without_meal || companySettingsForEmployee?.business_trip_rate_without_meal || 46.48;
          const maxDailyValue = hasMealBenefits ? rateWithMeal : rateWithoutMeal;
          
          const originalUnconstrainedAmount = totalBusinessTripAmount + overtimeConversionAmount;
          const originalUnconstrainedDays = Math.ceil(originalUnconstrainedAmount / maxDailyValue);
          
          // If days were constrained, adjust hours proportionally
          if (originalUnconstrainedDays > standardizedBusinessTripDays) {
            const dayReductionRatio = standardizedBusinessTripDays / originalUnconstrainedDays;
            adjustedBusinessTripHours = (businessTripHours + overtimeConversionHours) * dayReductionRatio;
          }
        }

        return {
          employee_id: profile.user_id,
          employee_name: `${profile.first_name} ${profile.last_name}`,
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
          meal_voucher_amount: defaultMealVoucherAmount
        };
      }));

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
          {/* Responsive wrapper with horizontal scroll */}
          <div className="overflow-x-auto max-w-[calc(100vw-2rem)] lg:max-w-none">
            <div className="overflow-y-auto max-h-[600px]">
              <Table className="text-xs min-w-fit">
                <TableHeader className="sticky top-0 bg-background z-20">
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-30 w-40 min-w-40 text-xs font-medium border-r">
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
                          className={`text-center w-9 min-w-9 text-xs font-medium px-1 ${
                            isHol || isSun ? 'bg-red-50' : ''
                          } ${dayOfWeek === 6 ? 'bg-orange-50' : ''}`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-xs leading-none">{day}</span>
                            <span className="text-[10px] font-normal opacity-75 leading-none">{dayName}</span>
                          </div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-center w-10 min-w-10 text-xs font-medium bg-gray-50 border-l px-1">Tot</TableHead>
                    <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-yellow-50 px-1">Buoni</TableHead>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-16 min-w-16 text-xs font-medium bg-orange-50 px-1">Imp. Tot.</TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Importo totale trasferte</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-orange-50 px-1">Gg Tr.</TableHead>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Giorni trasferta normalizzati</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-orange-50 px-1">€/G</TableHead>
                         </TooltipTrigger>
                         <TooltipContent>
                           <p>Importo giornaliero trasferte</p>
                         </TooltipContent>
                       </Tooltip>
                     </TooltipProvider>
                     <TooltipProvider>
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-green-50 px-1">Conv.</TableHead>
                         </TooltipTrigger>
                         <TooltipContent>
                           <p>Gestione conversioni straordinari</p>
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
                            <span className="text-xs opacity-75">€{employee.meal_voucher_amount.toFixed(2)}</span>
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                      <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                      <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
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
                    {Object.entries(employee.totals.absence_totals).map(([absenceType, hours]) => {
                      if (hours > 0) {
                        return (
                          <TableRow key={`${employee.employee_id}-${absenceType}`} className="hover:bg-red-50/50">
                            <TableCell className="sticky left-0 bg-background z-10 font-medium text-xs px-2 py-1 border-r">
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
                                  className={`text-center px-0.5 py-1 text-xs ${
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
                             <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                             <TableCell className="text-center text-xs p-1 bg-orange-50">-</TableCell>
                             <TableCell className="text-center text-xs p-1 bg-green-50">-</TableCell>
                          </TableRow>
                        );
                      }
                      return null;
                    })}

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
                                 {employee.totals.business_trip_breakdown.overtime_conversion_hours > 0 && (
                                   <p>
                                     Conversioni: {employee.totals.business_trip_breakdown.overtime_conversion_hours.toFixed(1)}h × tariffa = 
                                     €{employee.totals.business_trip_breakdown.overtime_conversion_amount.toFixed(2)}
                                   </p>
                                 )}
                                 <p className="font-semibold pt-1 border-t">
                                   Totale: €{employee.totals.business_trip_amount.toFixed(2)}
                                 </p>
                                 <p className="font-semibold text-blue-600 pt-1 border-t">
                                   Normalizzazione: {employee.totals.standardized_business_trip_days} gg × €{employee.totals.daily_business_trip_rate.toFixed(2)}/gg
                                 </p>
                               </div>
                             </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                             onClick={() => setConversionDialog({
                               open: true,
                               userId: employee.employee_id,
                               userName: employee.employee_name,
                               originalOvertimeHours: employee.totals.overtime
                             })}
                             className="h-6 px-2 text-xs"
                           >
                             <TrendingDown className="h-3 w-3" />
                           </Button>
                         </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
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

      {/* Overtime Conversion Dialog */}
      <OvertimeConversionDialog
        open={conversionDialog.open}
        onOpenChange={(open) => setConversionDialog(prev => ({ ...prev, open }))}
        userId={conversionDialog.userId}
        userName={conversionDialog.userName}
        month={selectedMonth}
        originalOvertimeHours={conversionDialog.originalOvertimeHours}
        onSuccess={() => {
          fetchBusinessTripData(); // Refresh data after conversion
        }}
      />
    </div>
  );
};

export default BusinessTripsDashboard;