'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { OvertimeConversionDialog } from '@/components/OvertimeConversionDialog';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { MealVoucherConversionService, MealVoucherConversion } from '@/services/MealVoucherConversionService';
import { distributePayrollOvertime, applyPayrollOvertimeDistribution } from '@/utils/payrollOvertimeDistribution';
import { DayConversionToggle } from '@/components/DayConversionToggle';
import { MassConversionDialog } from '@/components/MassConversionDialog';
import { useToast } from '@/hooks/use-toast';
import { useBusinessTripsCache } from '@/hooks/use-business-trips-cache';
interface BusinessTripData {
  employee_id: string;
  employee_name: string;
  company_id: string;
  daily_data: {
    [day: string]: {
      ordinary: number;
      overtime: number;
      absence: string | null;
    };
  };
  totals: {
    ordinary: number;
    overtime: number;
    absence_totals: {
      [absenceType: string]: number;
    };
  };
  meal_vouchers: number;
  meal_voucher_amount: number;
  // Separate business trip types
  saturday_trips: {
    hours: number;
    amount: number;
    daily_data: {
      [day: string]: number;
    }; // hours per day
  };
  daily_allowances: {
    days: number;
    amount: number;
    daily_data: {
      [day: string]: boolean;
    }; // true if allowance earned
  };
  overtime_conversions: {
    hours: number;
    amount: number;
    monthly_total: boolean; // true if has conversion for the month
  };
  meal_voucher_conversions: {
    days: number;
    amount: number;
    daily_data: {
      [day: string]: boolean;
    }; // true if converted
  };
  // NEW: info giornaliere necessarie al CAP
  meal_vouchers_daily_data: {
    [day: string]: boolean;
  }; // BDP maturato e NON convertito
  daily_allowances_amounts: {
    [day: string]: number;
  }; // € TI del giorno (0 se assente)
  saturday_rate?: number; // tariffa oraria usata
}
const BusinessTripsDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  
  // Use the new caching hook
  const { 
    getCachedData, 
    recalculate, 
    isCalculating, 
    lastCalculated, 
    hasRealtimeError,
    cacheStatus 
  } = useBusinessTripsCache(selectedMonth);
  
  // Get current data from cache
  const { data: businessTripData, holidays, isFromCache } = getCachedData();

  // Italian holidays (fallback for standard holidays)
  const getItalianHolidays = (year: number) => {
    const holidays = new Set([`${year}-01-01`,
    // Capodanno
    `${year}-01-06`,
    // Epifania
    `${year}-04-25`,
    // Festa della Liberazione
    `${year}-05-01`,
    // Festa del Lavoro
    `${year}-06-02`,
    // Festa della Repubblica
    `${year}-08-15`,
    // Ferragosto
    `${year}-11-01`,
    // Ognissanti
    `${year}-12-08`,
    // Immacolata Concezione
    `${year}-12-25`,
    // Natale
    `${year}-12-26` // Santo Stefano
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
    const dayName = date.toLocaleDateString('it-IT', {
      weekday: 'short'
    });
    const isSunday = date.getDay() === 0;
    const isSaturday = date.getDay() === 6;
    const dateString = `${year}-${month.padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Check both company holidays and Italian standard holidays
    const italianHolidays = getItalianHolidays(parseInt(year));
    const isHoliday = holidays.includes(dateString) || italianHolidays.has(dateString);
    return {
      dayName,
      isSunday,
      isSaturday,
      isHoliday
    };
  };
  const handleRefresh = useCallback(() => {
    recalculate();
  }, [recalculate]);
  const handleOvertimeConversion = useCallback((userId: string, userName: string, originalOvertimeHours: number) => {
    setConversionDialog({
      open: true,
      userId,
      userName,
      originalOvertimeHours
    });
  }, []);
  const handleMassConversion = useCallback((userId: string, userName: string, companyId: string) => {
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
  }, [businessTripData, selectedMonth]);
  const handleConversionComplete = useCallback(() => {
    setConversionDialog({
      open: false,
      userId: '',
      userName: '',
      originalOvertimeHours: 0
    });
    recalculate();
  }, [recalculate]);
  const handleMassConversionComplete = useCallback(() => {
    setMassConversionDialog({
      open: false,
      userId: '',
      userName: '',
      companyId: '',
      workingDays: []
    });
    recalculate();
  }, [recalculate]);
  const toggleEmployeeExpanded = useCallback((employeeId: string) => {
    setExpandedEmployees(prev => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
  }, []);
  // Show loading state during calculation
  if (isCalculating && businessTripData.length === 0) {
    return <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
            <p className="text-muted-foreground">Panoramica dettagliata delle trasferte mensili</p>
          </div>
        </div>
        <div className="text-center py-12">Caricamento dati trasferte...</div>
      </div>;
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
  const calculateEmployeeBreakdowns = () => {
    const CAP_STD = 46.48; // senza BDP
    const CAP_BDP = 30.98; // con BDP

    // Helper function for rounding and clamping
    const clamp2 = (v: number) => Math.round(v * 100) / 100;

    // Helper function to choose best solution (P1 then P2)
    const chooseBest = (current: any, candidate: any) => {
      if (!current) return candidate;

      // P1: minimize total days
      if (candidate.daysTotal < current.daysTotal) return candidate;
      if (candidate.daysTotal > current.daysTotal) return current;

      // P2: maximize uniformity (prefer higher val30 closer to cap)
      const currentUniformity = current.plan.val30 / CAP_BDP;
      const candidateUniformity = candidate.plan.val30 / CAP_BDP;
      return candidateUniformity > currentUniformity ? candidate : current;
    };
    return businessTripData.map(emp => {
      // Totale R = TS + TI + CS + CB
      const TS_total = emp.saturday_trips.amount || 0;
      const TI_total = emp.daily_allowances.amount || 0;
      const CS_total = emp.overtime_conversions.amount || 0;
      const CB_total = emp.meal_voucher_conversions.amount || 0;
      const R = TS_total + TI_total + CS_total + CB_total;

      // Conta giorni disponibili
      let A46 = 0; // giorni SENZA buoni pasto
      let A30 = 0; // giorni CON buoni pasto (convertiti o non)
      Object.keys(emp.daily_data).forEach(d => {
        const w = emp.daily_data[d] || {
          ordinary: 0,
          overtime: 0,
          absence: null
        };
        const worked = w.ordinary + w.overtime > 0 && !w.absence;
        if (!worked) return;
        const hasCB = !!emp.meal_voucher_conversions.daily_data?.[d]; // convertito -> 46.48
        const hasBDPnotConv = !!emp.meal_vouchers_daily_data?.[d]; // maturato non convertito -> 30.98

        if (hasBDPnotConv) {
          A30 += 1; // 30.98
        } else {
          A46 += 1; // 46.48 (CB oppure nessun BDP)
        }
      });
      const N = A46 + A30;

      // Guard di capienza totale - edge case critico
      const capacity = A46 * CAP_STD + A30 * CAP_BDP;
      let residual = 0;
      let undistributed = 0;
      if (R > capacity + 1e-6) {
        // tolleranza FP
        residual = R - capacity;
        undistributed = residual;
      }

      // Output vars
      let daysAt46_48 = 0;
      let amountAt46_48 = 0;
      let remainderDays = 0;
      let remainderPerDay = 0;
      let warning: string | null = null;

      // No eligible days or capacity exceeded
      if (N === 0) {
        return {
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          daysAt46_48: 0,
          amountAt46_48: 0,
          remainderDays: 0,
          remainderPerDay: 0,
          remainderTotal: 0,
          ledgerAssignedTotal: 0,
          components: {
            saturday_trips: TS_total,
            daily_allowances: TI_total,
            overtime_conversions: CS_total,
            meal_voucher_conversions: CB_total
          },
          needCapacityWarning: R > 0 ? `${emp.employee_name}: nessun giorno eleggibile` : null,
          totalEligibleDays: 0,
          eligibleA46: A46,
          eligibleA30: A30,
          undistributed: R
        };
      }

      // Se c'è residuo non distribuibile, usa solo la capienza disponibile
      if (residual > 0) {
        daysAt46_48 = A46;
        amountAt46_48 = clamp2(A46 * CAP_STD);
        remainderDays = A30;
        remainderPerDay = A30 > 0 ? clamp2(CAP_BDP) : 0;
        const ledgerAssignedTotal = amountAt46_48 + remainderPerDay * remainderDays;
        return {
          employee_id: emp.employee_id,
          employee_name: emp.employee_name,
          daysAt46_48,
          amountAt46_48,
          remainderDays,
          remainderPerDay,
          remainderTotal: clamp2(remainderPerDay * remainderDays),
          ledgerAssignedTotal: clamp2(ledgerAssignedTotal),
          components: {
            saturday_trips: TS_total,
            daily_allowances: TI_total,
            overtime_conversions: CS_total,
            meal_voucher_conversions: CB_total
          },
          needCapacityWarning: `${emp.employee_name}: Capienza insufficiente: residuo non distribuibile €${clamp2(residual)}`,
          totalEligibleDays: A46 + A30,
          eligibleA46: A46,
          eligibleA30: A30,
          undistributed: clamp2(undistributed)
        };
      }

      // Caso speciale: A30 = 0 (tutti giorni 46.48)
      if (A30 === 0) {
        const giorni = Math.min(A46, Math.ceil(R / CAP_STD)); // P1: minimizza giorni
        const importo = giorni > 0 ? clamp2(R / giorni) : 0; // P2: uniforma importi

        daysAt46_48 = giorni;
        amountAt46_48 = clamp2(importo * giorni);
        remainderDays = 0;
        remainderPerDay = 0;
        if (importo > CAP_STD + 1e-6) {
          warning = `${emp.employee_name}: importo per giorno €${importo.toFixed(2)} supera il cap €${CAP_STD}`;
        }
      }
      // Caso misto: abbiamo sia 46.48 che 30.98
      else if (A46 > 0 && A30 > 0) {
        let best: any = null;
        const G46_max = Math.min(A46, Math.floor(R / CAP_STD));
        for (let G46 = G46_max; G46 >= 0; G46--) {
          const R1 = R - G46 * CAP_STD;
          if (R1 < 0) continue;
          if (R1 === 0) {
            // Tutto coperto con soli 46.48
            const solution = {
              daysTotal: G46,
              plan: {
                d46: G46,
                d30: 0,
                val30: 0
              }
            };
            best = chooseBest(best, solution);
            break; // è già ottimo in P1
          }

          // Quanti giorni 30.98 servono al minimo?
          const Gresto = Math.ceil(R1 / CAP_BDP);
          if (Gresto <= A30) {
            let val30 = R1 / Gresto; // uniforme e <= 30.98 per costruzione
            if (val30 > CAP_BDP) val30 = CAP_BDP;
            val30 = clamp2(val30);
            const solution = {
              daysTotal: G46 + Gresto,
              plan: {
                d46: G46,
                d30: Gresto,
                val30
              }
            };
            best = chooseBest(best, solution);
          }
        }

        // Se abbiamo trovato soluzione fattibile, applicala
        if (best) {
          daysAt46_48 = best.plan.d46;
          amountAt46_48 = clamp2(best.plan.d46 * CAP_STD);
          remainderDays = best.plan.d30;
          remainderPerDay = clamp2(best.plan.val30);
        } else {
          // Fallback robusto: distribuisci tutto uniformemente su soli 46.48
          const giorni = Math.min(A46, Math.ceil(R / CAP_STD));
          const importo = giorni > 0 ? clamp2(R / giorni) : 0;
          daysAt46_48 = giorni;
          amountAt46_48 = clamp2(importo * giorni);
          remainderDays = 0;
          remainderPerDay = 0;
          warning = `${emp.employee_name}: auto-adattato a distribuzione uniforme sui giorni €46.48`;
        }
      }
      // Solo giorni a 30.98
      else {
        const giorni = Math.min(A30, Math.ceil(R / CAP_BDP));
        const importo = giorni > 0 ? clamp2(R / giorni) : 0;
        daysAt46_48 = 0;
        amountAt46_48 = 0;
        remainderDays = giorni;
        remainderPerDay = importo;
        if (importo > CAP_BDP + 1e-6) {
          warning = `${emp.employee_name}: importo per giorno €${importo.toFixed(2)} supera il cap €${CAP_BDP}`;
        }
      }
      const ledgerAssignedTotal = clamp2(amountAt46_48 + remainderPerDay * remainderDays);

      // Verifica tolleranza arrotondamento
      const assigned = amountAt46_48 + remainderPerDay * remainderDays;
      const diff = R - assigned;
      if (Math.abs(diff) > 0.01) {
        console.warn(`${emp.employee_name}: differenza arrotondamento €${diff.toFixed(3)}`);
      }
      return {
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        daysAt46_48,
        amountAt46_48: clamp2(amountAt46_48),
        remainderDays,
        remainderPerDay: clamp2(remainderPerDay),
        remainderTotal: clamp2(remainderPerDay * remainderDays),
        ledgerAssignedTotal: clamp2(ledgerAssignedTotal),
        components: {
          saturday_trips: TS_total,
          daily_allowances: TI_total,
          overtime_conversions: CS_total,
          meal_voucher_conversions: CB_total
        },
        needCapacityWarning: warning,
        totalEligibleDays: A46 + A30,
        eligibleA46: A46,
        eligibleA30: A30,
        undistributed: clamp2(undistributed)
      };
    });
  };
  const employeeBreakdowns = calculateEmployeeBreakdowns();
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
          <p className="text-muted-foreground">Panoramica separata per tipologia di trasferta</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selezione mese" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({
                length: 12
              }, (_, i) => {
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const label = date.toLocaleDateString('it-IT', {
                  month: 'long',
                  year: 'numeric'
                });
                return <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>;
              })}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleRefresh} 
              variant="outline" 
              size="sm"
              disabled={isCalculating}
            >
              {isCalculating ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Calcolando...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Ricalcola
                </>
              )}
            </Button>
          </div>
          
          {/* Cache Status */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {cacheStatus.hasValidCache ? (
              <>
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span>
                  Dati in cache - Ultimo calcolo: {' '}
                  {cacheStatus.cacheTimestamp ? 
                    new Date(cacheStatus.cacheTimestamp).toLocaleTimeString('it-IT') : 
                    'sconosciuto'
                  }
                </span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                <span>Nessun dato in cache</span>
              </>
            )}
            {hasRealtimeError && (
              <>
                <span>•</span>
                <div className="h-2 w-2 bg-red-500 rounded-full" />
                <span>Sync realtime offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards - Per Employee Breakdown */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Riepilogo per Dipendente</h2>
        <div className="grid grid-cols-1 gap-4">
          {employeeBreakdowns.map(breakdown => {
          const employee = businessTripData.find(emp => emp.employee_id === breakdown.employee_id);
          const isExpanded = expandedEmployees.has(breakdown.employee_id);
          return <Card key={breakdown.employee_id} className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold">{breakdown.employee_name}</h3>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">€{breakdown.ledgerAssignedTotal.toFixed(2)}</div>
                    <p className="text-sm text-muted-foreground">Totale trasferte</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-700">
                          Giorni €{breakdown.daysAt46_48 > 0 ? (breakdown.amountAt46_48 / breakdown.daysAt46_48).toFixed(2) : '46.48'}
                        </p>
                        <p className="text-2xl font-bold text-blue-900">{breakdown.daysAt46_48}</p>
                      </div>
                      <MapPin className="h-8 w-8 text-blue-500" />
                    </div>
                    <p className="text-xs text-blue-600 mt-1">€{breakdown.amountAt46_48.toFixed(2)}</p>
                  </div>

                  {breakdown.remainderDays > 0 && <div className="bg-orange-50 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-orange-700">Giorni €{breakdown.remainderPerDay.toFixed(2)}</p>
                          <p className="text-2xl font-bold text-orange-900">{breakdown.remainderDays}</p>
                        </div>
                        <TrendingDown className="h-8 w-8 text-orange-500" />
                      </div>
                      <p className="text-xs text-orange-600 mt-1">Tot: €{breakdown.remainderTotal.toFixed(2)}</p>
                    </div>}

                  <div className="bg-emerald-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-emerald-700">Componenti</p>
                        <div className="text-xs text-emerald-600 space-y-1">
                          {breakdown.components.saturday_trips > 0 && <div>TS: €{breakdown.components.saturday_trips.toFixed(2)}</div>}
                          {breakdown.components.daily_allowances > 0 && <div>TI: €{breakdown.components.daily_allowances.toFixed(2)}</div>}
                          {breakdown.components.overtime_conversions > 0 && <div>CS: €{breakdown.components.overtime_conversions.toFixed(2)}</div>}
                          {breakdown.components.meal_voucher_conversions > 0 && <div>CB: €{breakdown.components.meal_voucher_conversions.toFixed(2)}</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Giorni Eleggibili</p>
                        <p className="text-2xl font-bold text-gray-900">{breakdown.totalEligibleDays}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-gray-500" />
                    </div>
                    <p className="text-xs text-gray-600 mt-1">€46.48: {breakdown.eligibleA46} | €30.98: {breakdown.eligibleA30}</p>
                  </div>
                </div>

                {/* Warning if capacity insufficient */}
                {breakdown.needCapacityWarning && <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-start">
                      <div className="flex-shrink-0">
                        <svg className="w-5 h-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Attenzione</h3>
                        <div className="mt-1 text-sm text-yellow-700">
                          {breakdown.needCapacityWarning}
                        </div>
                      </div>
                    </div>
                  </div>}

                {/* Expandable Details Section */}
                <Collapsible open={isExpanded} onOpenChange={() => toggleEmployeeExpanded(breakdown.employee_id)}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full mt-4 justify-between" size="sm">
                      <span>Mostra dettagli giornalieri</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="mt-4">
                    {employee && <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 p-3 border-b">
                          <h4 className="font-medium text-sm">{employee.employee_name} - Dettaglio Giornaliero</h4>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <Table className="text-sm">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[100px] text-xs font-medium">Tipo</TableHead>
                                {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const day = i + 1;
                            const {
                              dayName,
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(day);
                            return <TableHead key={day} className={`text-center w-8 min-w-8 max-w-8 text-xs font-medium p-1 ${isSunday || isHoliday ? 'bg-red-50 text-red-700' : isSaturday ? 'bg-orange-50 text-orange-700' : ''}`} title={`${dayName} ${day}`}>
                                      <div className="flex flex-col">
                                        <span className="font-bold">{day}</span>
                                        <span className="text-xs font-normal opacity-75">{dayName}</span>
                                      </div>
                                    </TableHead>;
                          })}
                                <TableHead className="text-center w-12 min-w-12 text-xs font-medium bg-gray-50">Tot</TableHead>
                                <TableHead className="text-center w-16 min-w-16 text-xs font-medium bg-yellow-50">Buoni</TableHead>
                                <TableHead className="text-center w-16 min-w-16 text-xs font-medium">Importo</TableHead>
                                <TableHead className="min-w-[100px] text-xs font-medium">Azioni</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {/* Ordinary hours row */}
                              <TableRow className="hover:bg-green-50/50">
                                <TableCell className="font-medium text-xs p-2">
                                  <span className="text-green-700 font-bold">O</span> - Ordinarie
                                </TableCell>
                                {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const ordinary = employee.daily_data[dayKey]?.ordinary || 0;
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''} ${ordinary > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
                                      {ordinary > 0 ? ordinary.toFixed(1) : ''}
                                    </TableCell>;
                          })}
                                <TableCell className="text-center font-bold text-green-700 text-xs p-1 bg-gray-50">
                                  {employee.totals.ordinary.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-center text-xs p-1 bg-yellow-50">
                                  {employee.meal_vouchers > 0 ? `${employee.meal_vouchers} (€${employee.meal_voucher_amount.toFixed(2)})` : ''}
                                </TableCell>
                                <TableCell className="text-center text-xs p-1">€0.00</TableCell>
                                <TableCell className="p-1"></TableCell>
                              </TableRow>

                              {/* Overtime hours row */}
                              <TableRow className="hover:bg-blue-50/50">
                                <TableCell className="font-medium text-xs p-2">
                                  <span className="text-blue-700 font-bold">S</span> - Straordinari
                                </TableCell>
                                {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const overtime = employee.daily_data[dayKey]?.overtime || 0;
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''} ${overtime > 0 ? 'text-blue-700 font-medium' : 'text-muted-foreground'}`}>
                                      {overtime > 0 ? overtime.toFixed(1) : ''}
                                    </TableCell>;
                          })}
                                <TableCell className="text-center font-bold text-blue-700 text-xs p-1 bg-gray-50">
                                  {employee.totals.overtime.toFixed(1)}
                                </TableCell>
                                <TableCell className="text-center text-xs p-1 bg-yellow-50"></TableCell>
                                <TableCell className="text-center text-xs p-1">€0.00</TableCell>
                                <TableCell className="p-1"></TableCell>
                              </TableRow>

                              {/* Saturday trips row - Only show if has data */}
                              {employee.saturday_trips.hours > 0 && <TableRow className="hover:bg-orange-50/50">
                                  <TableCell className="font-medium text-xs p-2">
                                    <span className="text-orange-700 font-bold">TS</span> - Trasferte Sabato
                                  </TableCell>
                                  {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const saturdayHours = employee.saturday_trips.daily_data[dayKey] || 0;
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''} ${saturdayHours > 0 ? 'text-orange-700 font-medium' : 'text-muted-foreground'}`}>
                                        {saturdayHours > 0 ? saturdayHours.toFixed(1) : ''}
                                      </TableCell>;
                          })}
                                  <TableCell className="text-center font-bold text-orange-700 text-xs p-1 bg-gray-50">
                                    {employee.saturday_trips.hours.toFixed(1)}
                                  </TableCell>
                                  <TableCell className="text-center text-xs p-1 bg-yellow-50"></TableCell>
                                  <TableCell className="text-center text-xs p-1">
                                    €{employee.saturday_trips.amount.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="p-1"></TableCell>
                                </TableRow>}

                              {/* Daily allowances row - Only show if has data */}
                              {employee.daily_allowances.days > 0 && <TableRow className="hover:bg-teal-50/50">
                                  <TableCell className="font-medium text-xs p-2">
                                    <span className="text-teal-700 font-bold">TI</span> - Trasferte Indennità
                                  </TableCell>
                                  {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const hasAllowance = employee.daily_allowances.daily_data[dayKey] || false;
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''} ${hasAllowance ? 'text-teal-700 font-medium' : 'text-muted-foreground'}`}>
                                        {hasAllowance ? '✓' : ''}
                                      </TableCell>;
                          })}
                                  <TableCell className="text-center font-bold text-teal-700 text-xs p-1 bg-gray-50">
                                    {employee.daily_allowances.days}
                                  </TableCell>
                                  <TableCell className="text-center text-xs p-1 bg-yellow-50"></TableCell>
                                  <TableCell className="text-center text-xs p-1">
                                    €{employee.daily_allowances.amount.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="p-1"></TableCell>
                                </TableRow>}

                              {/* Overtime conversions row - Show if has converted hours OR available overtime to convert */}
                              {(employee.overtime_conversions.hours > 0 || employee.totals.overtime > 0) && <TableRow className="hover:bg-indigo-50/50">
                                  <TableCell className="font-medium text-xs p-2">
                                    <span className="text-indigo-700 font-bold">CS</span> - Conv. Straordinari
                                  </TableCell>
                                  {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            // Show conversion proportionally distributed based on overtime days
                            const originalOvertime = employee.daily_data[dayKey]?.overtime || 0;
                            const totalOriginalOvertime = employee.totals.overtime + employee.overtime_conversions.hours;
                            const conversionForDay = totalOriginalOvertime > 0 && originalOvertime > 0 ? originalOvertime / totalOriginalOvertime * employee.overtime_conversions.hours : 0;
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''} ${conversionForDay > 0 ? 'text-indigo-700 font-medium' : 'text-muted-foreground'}`}>
                                        {conversionForDay > 0 ? conversionForDay.toFixed(1) : ''}
                                      </TableCell>;
                          })}
                                  <TableCell className="text-center font-bold text-indigo-700 text-xs p-1 bg-gray-50">
                                    {employee.overtime_conversions.hours.toFixed(1)}
                                  </TableCell>
                                  <TableCell className="text-center text-xs p-1 bg-yellow-50"></TableCell>
                                  <TableCell className="text-center text-xs p-1">
                                    €{employee.overtime_conversions.amount.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="p-1">
                                    <div className="flex gap-1">
                                      <Button onClick={() => handleOvertimeConversion(employee.employee_id, employee.employee_name, employee.totals.overtime + employee.overtime_conversions.hours)} variant="outline" size="sm" className="h-6 px-2 text-xs">Conversioni</Button>
                                    </div>
                                  </TableCell>
                                </TableRow>}

                              {/* Meal voucher conversions row */}
                              <TableRow className="hover:bg-purple-50/50">
                                <TableCell className="font-medium text-xs p-2">
                                  <span className="text-purple-700 font-bold">CB</span> - Conv. Buoni
                                </TableCell>
                                {Array.from({
                            length: getDaysInMonth()
                          }, (_, i) => {
                            const dayKey = String(i + 1).padStart(2, '0');
                            const {
                              isSunday,
                              isSaturday,
                              isHoliday
                            } = getDateInfo(i + 1);
                            const [year, month] = selectedMonth.split('-');
                            const date = `${year}-${month}-${dayKey}`;
                            return <TableCell key={i + 1} className={`text-center text-xs p-1 ${isSunday || isHoliday ? 'bg-red-50' : isSaturday ? 'bg-orange-50' : ''}`}>
                                      <DayConversionToggle userId={employee.employee_id} userName={employee.employee_name} date={date} companyId={employee.company_id} size="sm" onConversionUpdated={handleRefresh} />
                                    </TableCell>;
                          })}
                                <TableCell className="text-center font-bold text-purple-700 text-xs p-1 bg-gray-50">
                                  {employee.meal_voucher_conversions.days}
                                </TableCell>
                                <TableCell className="text-center text-xs p-1 bg-yellow-50"></TableCell>
                                <TableCell className="text-center text-xs p-1">
                                  €{employee.meal_voucher_conversions.amount.toFixed(2)}
                                </TableCell>
                                <TableCell className="p-1">
                                  <div className="flex gap-1">
                                    <Button onClick={() => handleMassConversion(employee.employee_id, employee.employee_name, employee.company_id)} variant="outline" size="sm" className="h-6 px-2 text-xs">Conversioni</Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>}
                  </CollapsibleContent>
                </Collapsible>
              </Card>;
        })}
        </div>
      </div>

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

      <OvertimeConversionDialog open={conversionDialog.open} onOpenChange={open => setConversionDialog(prev => ({
      ...prev,
      open
    }))} userId={conversionDialog.userId} userName={conversionDialog.userName} month={selectedMonth} originalOvertimeHours={conversionDialog.originalOvertimeHours} onSuccess={handleConversionComplete} />
      
      <MassConversionDialog open={massConversionDialog.open} onOpenChange={open => setMassConversionDialog(prev => ({
      ...prev,
      open
    }))} userId={massConversionDialog.userId} userName={massConversionDialog.userName} companyId={massConversionDialog.companyId} month={selectedMonth} workingDays={massConversionDialog.workingDays} onConversionUpdated={handleMassConversionComplete} />
    </div>;
};
export default BusinessTripsDashboard;