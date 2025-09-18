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
import { MassConversionDialog } from '@/components/MassConversionDialog';
import { useToast } from '@/hooks/use-toast';

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
  // NEW: info giornaliere necessarie al CAP
  meal_vouchers_daily_data: { [day: string]: boolean };          // BDP maturato e NON convertito
  daily_allowances_amounts: { [day: string]: number };           // € TI del giorno (0 se assente)
  saturday_rate?: number;                                        // tariffa oraria usata
}

const BusinessTripsDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [businessTripData, setBusinessTripData] = useState<BusinessTripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Italian holidays (fallback for standard holidays)
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
    ]);
    
    // Easter-related holidays (simplified calculation for 2024-2025)
    if (year === 2024) {
      holidays.add(`${year}-03-31`); // Pasqua 2024
      holidays.add(`${year}-04-01`); // Lunedì dell'Angelo 2024
    } else if (year === 2025) {
      holidays.add(`${year}-04-20`); // Pasqua 2025
      holidays.add(`${year}-04-21`); // Lunedì dell'Angelo 2025
    }
    
    return holidays;
  };
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

  const [massConversionDialog, setMassConversionDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    companyId: string;
    workingDays: string[];
  }>({
    open: false,
    userId: '',
    userName: '',
    companyId: '',
    workingDays: []
  });

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-');
    return new Date(parseInt(year), parseInt(month), 0).getDate();
  };

  const getDateInfo = (day: number) => {
    const [year, month] = selectedMonth.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, day);
    const dayName = date.toLocaleDateString('it-IT', { weekday: 'short' });
    const isSunday = date.getDay() === 0;
    const isSaturday = date.getDay() === 6;
    const dateString = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Check both company holidays and Italian standard holidays
    const italianHolidays = getItalianHolidays(parseInt(year));
    const isHoliday = holidays.includes(dateString) || italianHolidays.has(dateString);
    
    return { dayName, isSunday, isSaturday, isHoliday };
  };

  const fetchBusinessTripData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log(`🚀 [BusinessTripsDashboard] Inizio caricamento dati per ${selectedMonth}`);
      
      // Prima esegui le conversioni automatiche con validazione
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      // Le conversioni automatiche sono state rimosse - solo conversioni manuali supportate
      console.log(`ℹ️ [BusinessTripsDashboard] Solo conversioni manuali supportate per ${selectedMonth}`);

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

      // Fetch holidays for the selected month
      const { data: holidayData, error: holidayError } = await supabase
        .from('company_holidays')
        .select('date')
        .eq('company_id', me!.company_id)
        .gte('date', startDate)
        .lte('date', endDate);
      
      if (holidayError) {
        console.warn('Error fetching holidays:', holidayError);
      }
      
      const holidayDates = holidayData?.map(h => h.date) || [];
      setHolidays(holidayDates);

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

      // Process automatic conversions once per company (già fatto sopra con validazione)
      // await OvertimeConversionService.processAutomaticConversions(selectedMonth, me!.company_id);

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

          // NEW: initialize new fields
          const mealVouchersDaily: { [day: string]: boolean } = {};
          const dailyAllowanceAmounts: { [day: string]: number } = {};

          const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            const dayKey = String(day).padStart(2, '0');
            dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
            saturdayTrips.daily_data[dayKey] = 0;
            dailyAllowances.daily_data[dayKey] = false;
            mealVoucherConversions.daily_data[dayKey] = false;
            // NEW: initialize new daily data
            mealVouchersDaily[dayKey] = false;
            dailyAllowanceAmounts[dayKey] = 0;
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

            // TI (indennità giornaliera)
            if (mealBenefits.dailyAllowance) {
              dailyAllowances.days += 1;
              dailyAllowances.daily_data[dayKey] = true;
              const effectiveDailyAllowanceAmount = mealBenefits.dailyAllowanceAmount 
                || temporalSettings?.daily_allowance_amount 
                || companySettingsForEmployee?.default_daily_allowance_amount 
                || 10;
              dailyAllowances.amount += effectiveDailyAllowanceAmount;

              // NEW: salva l'importo TI del giorno
              dailyAllowanceAmounts[dayKey] = effectiveDailyAllowanceAmount;
            }

            // BDP "non convertito" (serve per CAP=30,98)
            if (mealBenefits.mealVoucher) {
              mealVoucherDays++;
              if (!employeeConversions.some(conv => conv.date === ts.date && conv.converted_to_allowance)) {
                mealVouchersDaily[dayKey] = true;  // BDP maturato e NON convertito
              }
            }

            // CB (già fai la somma mensile + daily flag)
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
            // NEW: add new fields
            meal_vouchers_daily_data: mealVouchersDaily,         // NEW
            daily_allowances_amounts: dailyAllowanceAmounts,     // NEW
            saturday_rate: defaultSaturdayRate,                  // NEW
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

  const handleMassConversion = (userId: string, userName: string, companyId: string) => {
    // Get working days for the month (days with worked hours)
    const employee = businessTripData.find(emp => emp.employee_id === userId);
    if (!employee) return;

    const workingDays: string[] = [];
    const [year, month] = selectedMonth.split('-');
    
    Object.entries(employee.daily_data).forEach(([dayKey, data]) => {
      if ((data.ordinary > 0 || data.overtime > 0) && !data.absence) {
        const date = `${year}-${month}-${dayKey}`;
        workingDays.push(date);
      }
    });

    setMassConversionDialog({
      open: true,
      userId,
      userName,
      companyId,
      workingDays
    });
  };

  const handleConversionComplete = () => {
    setConversionDialog({ open: false, userId: '', userName: '', originalOvertimeHours: 0 });
    fetchBusinessTripData();
  };

  const handleMassConversionComplete = () => {
    setMassConversionDialog({ open: false, userId: '', userName: '', companyId: '', workingDays: [] });
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
  
  // Calculate business trip days according to business rules
  const calculateBusinessTripBreakdown = () => {
    const CAP_STD = 46.48;   // senza BDP o con BDP convertito
    const CAP_CON_BDP = 30.98; // con BDP non convertito
    const BDP = 8.00;

    let daysAt46_48 = 0;
    let amountAt46_48 = 0;
    let daysAt30_98 = 0;
    let amountAt30_98 = 0;

    let totalAssigned = 0;        // Σ Assegnato_d (serve riconciliazione)
    let totalCB = 0;              // Σ CB
    let totalCS = 0;              // Σ CS (importo)
    let totalTS = 0;              // Σ TS (importo)
    let totalTI = 0;              // Σ TI (importo)

    businessTripData.forEach((emp) => {
      // Dati utili
      const rate = emp.saturday_rate || (emp.saturday_trips.hours > 0 ? (emp.saturday_trips.amount / emp.saturday_trips.hours) : 10);
      const days = Object.keys(emp.daily_data); // "01".."31"

      // Ripartizione CS (importo) proporzionale alle ore straordinarie originali del giorno
      const totalOTOriginal = emp.totals.overtime + emp.overtime_conversions.hours; // ore totali PRIMA della conversione
      const csAmountTot = emp.overtime_conversions.amount || 0;

      // Primo pass: calcolo dei "raw component per giorno" senza CS
      const rawNoCS: Record<string, number> = {};
      const capByDay: Record<string, number> = {};
      const eligibleByDay: Record<string, boolean> = {};

      days.forEach((dayKey) => {
        const work = emp.daily_data[dayKey] || { ordinary: 0, overtime: 0, absence: null };

        // Giorno eleggibile: ha ore oppure è sabato con gestione già in TS (saturday_trips.daily_data>0)
        const tsHours = emp.saturday_trips.daily_data[dayKey] || 0;
        const eligible = (work.ordinary + work.overtime) > 0 || tsHours > 0;
        eligibleByDay[dayKey] = eligible;

        // CAP: 30,98 se BDP maturato e NON convertito; altrimenti 46,48
        const hasBdpNotConverted = !!emp.meal_vouchers_daily_data?.[dayKey];
        const hasCB = !!emp.meal_voucher_conversions.daily_data?.[dayKey];

        const cap = (hasBdpNotConverted && !hasCB) ? CAP_CON_BDP : CAP_STD;
        capByDay[dayKey] = cap;

        // Componenti "base" del giorno
        const tsEuro = tsHours * rate;
        const tiEuro = emp.daily_allowances_amounts?.[dayKey] || 0;
        const cbEuro = hasCB ? BDP : 0;

        rawNoCS[dayKey] = tsEuro + tiEuro + cbEuro;

        // Accumuli per tipologia
        totalTS += tsEuro;
        totalTI += tiEuro;
        totalCB += cbEuro;
      });

      // Secondo pass: distribuisci CS sugli unici giorni con capienza residua, proporzionalmente alle ore S del giorno
      const csPerDay: Record<string, number> = {};
      days.forEach((dayKey) => csPerDay[dayKey] = 0);

      if (csAmountTot > 0 && totalOTOriginal > 0) {
        // quota teorica ∝ straordinario originale del giorno
        const quotaTeorica: Record<string, number> = {};
        let quotaTeoricaSum = 0;

        days.forEach((dayKey) => {
          const otOriginalDay = emp.daily_data[dayKey]?.overtime || 0;
          const q = (otOriginalDay / totalOTOriginal) * csAmountTot;
          quotaTeorica[dayKey] = q;
          quotaTeoricaSum += q;
        });

        // alloca rispettando i CAP
        let csResiduo = csAmountTot;
        // primo giro: fino allo spazio disponibile di ogni giorno
        days.forEach((dayKey) => {
          if (!eligibleByDay[dayKey]) return;

          const space = Math.max(0, capByDay[dayKey] - rawNoCS[dayKey]); // capienza residua
          const take = Math.min(space, quotaTeorica[dayKey]);
          csPerDay[dayKey] += take;
          csResiduo -= take;
        });
        // secondo giro: se resta qualcosa, distribuisci greedily sugli eleggibili con spazio
        if (csResiduo > 0.0001) {
          days.forEach((dayKey) => {
            if (!eligibleByDay[dayKey]) return;
            const space = Math.max(0, capByDay[dayKey] - rawNoCS[dayKey] - csPerDay[dayKey]);
            if (space <= 0) return;
            const take = Math.min(space, csResiduo);
            csPerDay[dayKey] += take;
            csResiduo -= take;
          });
        }
      }

      // Terzo pass: Assegnato_d e KPI per i "giorni pieni"
      let perDaySum = 0;
      days.forEach((dayKey) => {
        if (!eligibleByDay[dayKey]) return;

        const assigned = Math.min(capByDay[dayKey], rawNoCS[dayKey] + csPerDay[dayKey]);
        perDaySum += assigned;

        // Classificazioni
        if (assigned === CAP_STD) {
          daysAt46_48 += 1;
          amountAt46_48 += assigned;
        } else if (assigned === CAP_CON_BDP) {
          daysAt30_98 += 1;
          amountAt30_98 += assigned;
        }

      });

      totalAssigned += perDaySum;
      totalCS += csAmountTot;
    });

    return {
      totalDays: daysAt46_48 + daysAt30_98,
      daysAt46_48,
      amountAt46_48,
      daysAt30_98,
      amountAt30_98,
      totalAmount: amountAt46_48 + amountAt30_98,           // solo giorni pieni
      // Per i box:
      ledgerAssignedTotal: totalAssigned,                   // Σ Assegnato_d (VERITÀ per KPI Totale Trasferte)
      byTypeTotal: totalTS + totalTI + totalCS + totalCB,   // somma TS+TI+CS+CB (deve = ledgerAssignedTotal)
      conversionAmount: totalCB,
    };
  };
  
  const businessTripBreakdown = calculateBusinessTripBreakdown();

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <CardTitle className="text-sm font-medium">Giorni €46.48</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{businessTripBreakdown.daysAt46_48}</div>
            <p className="text-xs text-muted-foreground">€{businessTripBreakdown.amountAt46_48.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giorni €30.98</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{businessTripBreakdown.daysAt30_98}</div>
            <p className="text-xs text-muted-foreground">€{businessTripBreakdown.amountAt30_98.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Trasferte</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{businessTripBreakdown.ledgerAssignedTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">TS + TI + CB + CS (dopo CAP)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale Generale</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{businessTripBreakdown.ledgerAssignedTotal.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Incluse conversioni</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation line */}
      <div className="text-center">
        <p className="text-[11px] text-muted-foreground">
          Recon: per-giorno €{businessTripBreakdown.ledgerAssignedTotal.toFixed(2)} / per-tipologia €{businessTripBreakdown.byTypeTotal.toFixed(2)}
        </p>
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
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px] py-2">Dipendente</TableHead>
                      <TableHead className="min-w-[100px] py-2">Tipo</TableHead>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => {
                        const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                        return (
                          <TableHead 
                            key={i + 1} 
                            className={`w-7 text-center text-xs py-1 px-1 ${
                              isSunday || isHoliday ? 'bg-red-100 text-red-700' : 
                              isSaturday ? 'bg-orange-100 text-orange-700' : ''
                            }`}
                          >
                            {i + 1}
                          </TableHead>
                        );
                      })}
                      <TableHead className="text-right min-w-[70px] py-2">Totale</TableHead>
                      <TableHead className="text-right min-w-[80px] py-2">Buoni</TableHead>
                      <TableHead className="text-right min-w-[80px] py-2">Importo</TableHead>
                      <TableHead className="min-w-[100px] py-2">Azioni</TableHead>
                    </TableRow>
                    {/* Weekday names row */}
                    <TableRow>
                      <TableHead className="py-1"></TableHead>
                      <TableHead className="py-1"></TableHead>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => {
                        const { dayName, isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                        return (
                          <TableHead 
                            key={i + 1} 
                            className={`w-7 text-center text-xs py-1 px-1 ${
                              isSunday || isHoliday ? 'bg-red-100 text-red-700' : 
                              isSaturday ? 'bg-orange-100 text-orange-700' : ''
                            }`}
                          >
                            {dayName}
                          </TableHead>
                        );
                      })}
                      <TableHead className="py-1"></TableHead>
                      <TableHead className="py-1"></TableHead>
                      <TableHead className="py-1"></TableHead>
                      <TableHead className="py-1"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {businessTripData.map((employee) => (
                      <React.Fragment key={employee.employee_id}>
                         {/* Ordinary hours row */}
                        <TableRow>
                          <TableCell className="font-medium py-1">{employee.employee_name}</TableCell>
                          <TableCell className="text-sm text-blue-600 py-1">O</TableCell>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
                             const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                             return (
                               <TableCell 
                                 key={i + 1} 
                                 className={`text-center text-xs py-1 px-1 ${
                                   isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''
                                 }`}
                               >
                                 {ordinary > 0 ? ordinary.toFixed(1) : ''}
                               </TableCell>
                             );
                          })}
                          <TableCell className="text-right font-medium py-1">
                            {employee.totals.ordinary.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right py-1">
                            {employee.meal_vouchers > 0 
                              ? `${employee.meal_vouchers} (€${employee.meal_voucher_amount.toFixed(2)})`
                              : ''
                            }
                          </TableCell>
                          <TableCell className="text-right py-1">€0.00</TableCell>
                          <TableCell className="py-1"></TableCell>
                        </TableRow>

                        {/* Overtime hours row */}
                        <TableRow>
                          <TableCell className="py-1"></TableCell>
                          <TableCell className="text-sm text-amber-600 py-1">S</TableCell>
                           {Array.from({ length: getDaysInMonth() }, (_, i) => {
                             const dayKey = String(i + 1).padStart(2, '0');
                             const originalOvertime = employee.daily_data[dayKey]?.overtime || 0;
                             // Calculate reduced overtime after proportional conversion
                             const originalTotalOvertimeHours = employee.totals.overtime + employee.overtime_conversions.hours;
                             const proportionalConversion = originalTotalOvertimeHours > 0 && employee.overtime_conversions.hours > 0
                               ? (originalOvertime / originalTotalOvertimeHours) * employee.overtime_conversions.hours
                               : 0;
                             const reducedOvertime = Math.max(0, originalOvertime - proportionalConversion);
                             const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                             return (
                               <TableCell 
                                 key={i + 1} 
                                 className={`text-center text-xs py-1 px-1 ${
                                   isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''
                                 }`}
                               >
                                 {reducedOvertime > 0 ? reducedOvertime.toFixed(1) : ''}
                               </TableCell>
                             );
                           })}
                          <TableCell className="text-right font-medium py-1">
                            {employee.totals.overtime.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right py-1"></TableCell>
                          <TableCell className="text-right py-1">€0.00</TableCell>
                          <TableCell className="py-1">
                            {/* CORREZIONE: Mostra sempre il tasto se le conversioni sono abilitate o se ci sono già conversioni */}
                            {(employee.totals.overtime > 0 || employee.overtime_conversions.hours > 0) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOvertimeConversion(
                                  employee.employee_id,
                                  employee.employee_name,
                                  employee.totals.overtime // CORREZIONE: Passa solo gli straordinari attuali (già ridotti)
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
                              <TableCell className="py-1"></TableCell>
                              <TableCell className="text-sm text-gray-600 py-1">{absenceType}</TableCell>
                              {Array.from({ length: getDaysInMonth() }, (_, i) => {
                                const dayKey = String(i + 1).padStart(2, '0');
                                const absence = employee.daily_data[dayKey]?.absence;
                                 const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                                 return (
                                   <TableCell 
                                     key={i + 1} 
                                     className={`text-center text-xs py-1 px-1 ${
                                       isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''
                                     }`}
                                   >
                                     {absence === absenceType ? absence.charAt(0).toUpperCase() : ''}
                                   </TableCell>
                                 );
                              })}
                              <TableCell className="text-right font-medium py-1">
                                {hours.toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right py-1"></TableCell>
                              <TableCell className="text-right py-1">€0.00</TableCell>
                              <TableCell className="py-1"></TableCell>
                            </TableRow>
                          )
                        ))}

                        {/* Saturday trips row */}
                        {employee.saturday_trips.hours > 0 && (
                          <TableRow className="bg-orange-50">
                            <TableCell className="py-1"></TableCell>
                            <TableCell className="text-sm font-medium text-orange-700 py-1">TS</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const hours = employee.saturday_trips.daily_data[dayKey] || 0;
                               const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                               return (
                                 <TableCell 
                                   key={i + 1} 
                                   className={`text-center text-xs font-medium py-1 px-1 ${
                                     isSunday || isHoliday ? 'bg-red-100' : isSaturday ? 'bg-orange-100' : 'bg-orange-50'
                                   }`}
                                 >
                                   {hours > 0 ? hours.toFixed(1) : ''}
                                 </TableCell>
                               );
                            })}
                            <TableCell className="text-right font-bold text-orange-700 py-1">
                              {employee.saturday_trips.hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right py-1"></TableCell>
                            <TableCell className="text-right font-bold text-orange-700 py-1">
                              €{employee.saturday_trips.amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="py-1"></TableCell>
                          </TableRow>
                        )}

                        {/* Daily allowances row */}
                        {employee.daily_allowances.days > 0 && (
                          <TableRow className="bg-blue-50">
                            <TableCell className="py-1"></TableCell>
                            <TableCell className="text-sm font-medium text-blue-700 py-1">TI</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const hasAllowance = employee.daily_allowances.daily_data[dayKey];
                               const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                               return (
                                 <TableCell 
                                   key={i + 1} 
                                   className={`text-center text-xs font-medium py-1 px-1 ${
                                     isSunday || isHoliday ? 'bg-red-100' : isSaturday ? 'bg-orange-100' : 'bg-blue-50'
                                   }`}
                                 >
                                   {hasAllowance ? 'TI' : ''}
                                 </TableCell>
                               );
                            })}
                            <TableCell className="text-right font-bold text-blue-700 py-1">
                              {employee.daily_allowances.days}
                            </TableCell>
                            <TableCell className="text-right py-1"></TableCell>
                            <TableCell className="text-right font-bold text-blue-700 py-1">
                              €{employee.daily_allowances.amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="py-1"></TableCell>
                          </TableRow>
                        )}

                        {/* Overtime conversions row */}
                        {employee.overtime_conversions.hours > 0 && (
                          <TableRow className="bg-green-50">
                            <TableCell className="py-1"></TableCell>
                            <TableCell className="text-sm font-medium text-green-700 py-1">CS</TableCell>
                            {Array.from({ length: getDaysInMonth() }, (_, i) => {
                              const dayKey = String(i + 1).padStart(2, '0');
                              const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                               // Calculate proportional conversion hours for this day based on original overtime
                               const originalDayOvertimeHours = employee.daily_data[dayKey]?.overtime || 0;
                               const originalTotalOvertimeHours = employee.totals.overtime + employee.overtime_conversions.hours; // Original total before conversion
                               const conversionHours = originalTotalOvertimeHours > 0 && employee.overtime_conversions.hours > 0
                                 ? (originalDayOvertimeHours / originalTotalOvertimeHours) * employee.overtime_conversions.hours
                                 : 0;
                              return (
                                <TableCell 
                                  key={i + 1} 
                                  className={`text-center text-xs font-medium py-1 px-1 ${
                                    isSunday || isHoliday ? 'bg-red-100' : isSaturday ? 'bg-orange-100' : 'bg-green-50'
                                  }`}
                                >
                                  {conversionHours > 0 ? conversionHours.toFixed(1) : ''}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right font-bold text-green-700 py-1">
                              {employee.overtime_conversions.hours.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right py-1"></TableCell>
                            <TableCell className="text-right font-bold text-green-700 py-1">
                              €{employee.overtime_conversions.amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="py-1"></TableCell>
                          </TableRow>
                        )}

                        {/* Meal voucher conversions row */}
                        <TableRow className="bg-purple-50">
                          <TableCell className="py-1"></TableCell>
                          <TableCell className="text-sm font-medium text-purple-700 py-1">CB</TableCell>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const hasWorkedHours = (employee.daily_data[dayKey]?.ordinary || 0) > 0 || (employee.daily_data[dayKey]?.overtime || 0) > 0;
                            const isConverted = employee.meal_voucher_conversions.daily_data[dayKey];
                            const { isSunday, isSaturday, isHoliday } = getDateInfo(i + 1);
                            return (
                              <TableCell 
                                key={i + 1} 
                                className={`text-center text-xs py-1 px-1 ${
                                  isSunday || isHoliday ? 'bg-red-100' : isSaturday ? 'bg-orange-100' : 'bg-purple-50'
                                }`}
                              >
                                {hasWorkedHours && (
                                  <DayConversionToggle
                                    userId={employee.employee_id}
                                    userName={employee.employee_name}
                                    date={`${selectedMonth.split('-')[0]}-${selectedMonth.split('-')[1]}-${dayKey}`}
                                    companyId={employee.company_id}
                                    isConverted={isConverted}
                                    onConversionUpdated={fetchBusinessTripData}
                                    size="sm"
                                  />
                                )}
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-right font-bold text-purple-700 py-1">
                            {employee.meal_voucher_conversions.days}
                          </TableCell>
                          <TableCell className="text-right py-1"></TableCell>
                          <TableCell className="text-right font-bold text-purple-700 py-1">
                            €{employee.meal_voucher_conversions.amount.toFixed(2)}
                          </TableCell>
                           <TableCell className="py-1">
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => handleMassConversion(employee.employee_id, employee.employee_name, employee.company_id)}
                             >
                               Conversioni
                             </Button>
                           </TableCell>
                        </TableRow>

                        {/* Separator row */}
                        <TableRow>
                          <TableCell colSpan={getDaysInMonth() + 6} className="h-1 border-b border-gray-200 py-1"></TableCell>
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
          <CardTitle>Legenda Completa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Work type abbreviations */}
            <div>
              <h4 className="text-sm font-medium mb-2">Tipologie di Ore</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-200 rounded"></div>
                  <span><strong>O</strong> - Ore Ordinarie</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-200 rounded"></div>
                  <span><strong>S</strong> - Ore Straordinarie</span>
                </div>
              </div>
            </div>

            {/* Business trip types */}
            <div>
              <h4 className="text-sm font-medium mb-2">Tipologie di Trasferte</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-200 rounded"></div>
                  <span><strong>TS</strong> - Trasferte Sabato (ore * tariffa oraria)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-200 rounded"></div>
                  <span><strong>TI</strong> - Trasferte Indennità (giorni a €30.98 o €46.48)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-200 rounded"></div>
                  <span><strong>CS</strong> - Conversioni Straordinari</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-200 rounded"></div>
                  <span><strong>CB</strong> - Conversioni Buoni Pasto (+€8.00)</span>
                </div>
              </div>
            </div>

            {/* Daily rates explanation */}
            <div>
              <h4 className="text-sm font-medium mb-2">Tariffe Trasferte Giornaliere</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span><strong>€46.48</strong> - Giorni TI con conversioni buoni pasto (CB)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span><strong>€30.98</strong> - Giorni TI senza conversioni buoni pasto</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Le conversioni buoni pasto (CB) aggiungono €8.00 e permettono di utilizzare la tariffa €46.48 invece di €30.98
                </p>
              </div>
            </div>

            {/* Absence types */}
            <div>
              <h4 className="text-sm font-medium mb-2">Tipologie di Assenze</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span><strong>F</strong> - Ferie</span>
                </div>
                <div className="flex items-center gap-2">
                  <span><strong>M</strong> - Malattia</span>
                </div>
                <div className="flex items-center gap-2">
                  <span><strong>P</strong> - Permesso</span>
                </div>
                <div className="flex items-center gap-2">
                  <span><strong>S</strong> - Sciopero</span>
                </div>
                <div className="flex items-center gap-2">
                  <span><strong>I</strong> - Infortunio</span>
                </div>
                <div className="flex items-center gap-2">
                  <span><strong>A</strong> - Altra assenza</span>
                </div>
              </div>
            </div>

            {/* Day highlighting */}
            <div>
              <h4 className="text-sm font-medium mb-2">Evidenziazioni Giorni</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
                  <span>Domeniche e Festività</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded"></div>
                  <span>Sabati</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
            <p>• <strong>Giorni Trasferta:</strong> Somma di giorni indennità + giorni sabato (calcolati come ore/8)</p>
            <p>• <strong>€/Giorno Medio:</strong> Importo totale diviso per giorni di trasferta</p>
            <p>• <strong>Struttura Separata:</strong> Ogni tipologia ha una riga dedicata per maggiore chiarezza</p>
            <p>• <strong>Conversioni:</strong> CS è mensile, CB e TI sono giornalieri</p>
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
      
      <MassConversionDialog
        open={massConversionDialog.open}
        onOpenChange={(open) => setMassConversionDialog(prev => ({ ...prev, open }))}
        userId={massConversionDialog.userId}
        userName={massConversionDialog.userName}
        companyId={massConversionDialog.companyId}
        month={selectedMonth}
        workingDays={massConversionDialog.workingDays}
        onConversionUpdated={handleMassConversionComplete}
      />
    </div>
  );
};

export default BusinessTripsDashboard;