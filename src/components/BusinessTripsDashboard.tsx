'use client'

import React, { useState, useMemo, useCallback, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessTripData } from '@/hooks/useBusinessTripData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin, TrendingDown, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OvertimeConversionDialog } from '@/components/OvertimeConversionDialog';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { MealVoucherConversionService, MealVoucherConversion } from '@/services/MealVoucherConversionService';
import { distributePayrollOvertime, applyPayrollOvertimeDistribution } from '@/utils/payrollOvertimeDistribution';
import { DayConversionToggle } from '@/components/DayConversionToggle';
import { MassConversionDialog } from '@/components/MassConversionDialog';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { BusinessTripSkeleton } from '@/components/ui/business-trip-skeleton';
import OptimizedBusinessTripsDashboard from './OptimizedBusinessTripsDashboard';

// Lazy load toggle to avoid mounting hundreds of components
const LazyDayConversionToggle = React.lazy(() => 
  import('@/components/DayConversionToggle').then(m => ({ default: m.DayConversionToggle }))
);

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
  // Return optimized version for now to solve performance issues
  return <OptimizedBusinessTripsDashboard />;

  // Original complex version kept for reference but not used
  return <OriginalBusinessTripsDashboard />;
};

const OriginalBusinessTripsDashboard = () => {
  // ALL HOOKS MUST BE CALLED FIRST, BEFORE ANY CONDITIONAL RETURNS
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Use optimized hook for data fetching
  const { data: queryData, isLoading, error, refetch } = useBusinessTripData(selectedMonth);
  
  const businessTripData = queryData?.data || [];
  const holidays = queryData?.holidays || [];

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

  // Pre-calculate month calendar once (CRITICAL OPTIMIZATION)
  const { daysMeta, holidaysSet } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();

    // Italian holidays Set for O(1) lookup
    const itHolidays = new Set([
      `${y}-01-01`, `${y}-01-06`, `${y}-04-25`, `${y}-05-01`, `${y}-06-02`,
      `${y}-08-15`, `${y}-11-01`, `${y}-12-08`, `${y}-12-25`, `${y}-12-26`,
      ...(y === 2024 ? [`${y}-03-31`, `${y}-04-01`] : []),
      ...(y === 2025 ? [`${y}-04-20`, `${y}-04-21`] : []),
    ]);

    // Company holidays (from server) → Set for O(1)
    const holidaysSet = new Set(holidays);

    const daysMeta = Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      const date = new Date(y, m - 1, d);
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = date.getDay();
      const isSunday = dow === 0;
      const isSaturday = dow === 6;
      const isHoliday = holidaysSet.has(dateStr) || itHolidays.has(dateStr);
      const dayName = date.toLocaleDateString('it-IT', { weekday: 'short' });
      return {
        d,
        dayKey: String(d).padStart(2, '0'),
        dayName,
        isSunday,
        isSaturday,
        isHoliday,
        dateStr,
      };
    });

    return { daysMeta, holidaysSet };
  }, [selectedMonth, holidays]);

  // Memoize totals calculation
  const totals = useMemo(() => {
    const totalEmployees = businessTripData.length;
    const totalSaturdayHours = businessTripData.reduce((sum, emp) => sum + emp.saturday_trips.hours, 0);
    const totalSaturdayAmount = businessTripData.reduce((sum, emp) => sum + emp.saturday_trips.amount, 0);
    const totalDailyAllowanceDays = businessTripData.reduce((sum, emp) => sum + emp.daily_allowances.days, 0);
    const totalDailyAllowanceAmount = businessTripData.reduce((sum, emp) => sum + emp.daily_allowances.amount, 0);
    const totalOvertimeConversions = businessTripData.reduce((sum, emp) => sum + emp.overtime_conversions.amount, 0);
    const totalMealVoucherConversions = businessTripData.reduce((sum, emp) => sum + emp.meal_voucher_conversions.amount, 0);
    const grandTotal = totalSaturdayAmount + totalDailyAllowanceAmount + totalOvertimeConversions + totalMealVoucherConversions;
    
    return {
      totalEmployees,
      totalSaturdayHours,
      totalSaturdayAmount,
      totalDailyAllowanceDays,
      totalDailyAllowanceAmount,
      totalOvertimeConversions,
      totalMealVoucherConversions,
      grandTotal
    };
  }, [businessTripData]);

  // Memoize expensive calculations
  const employeeBreakdowns = useMemo(() => {
    const CAP_STD = 46.48;  // senza BDP
    const CAP_BDP = 30.98;  // con BDP

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
        const w = emp.daily_data[d] || { ordinary: 0, overtime: 0, absence: null };
        const worked = (w.ordinary + w.overtime) > 0 && !w.absence;
        if (!worked) return;

        const hasCB = !!emp.meal_voucher_conversions.daily_data?.[d];        // convertito -> 46.48
        const hasBDPnotConv = !!emp.meal_vouchers_daily_data?.[d];           // maturato non convertito -> 30.98

        if (hasBDPnotConv) {
          A30 += 1;     // 30.98
        } else {
          A46 += 1;     // 46.48 (CB oppure nessun BDP)
        }
      });

      const N = A46 + A30;

      // Guard di capienza totale - edge case critico
      const capacity = A46 * CAP_STD + A30 * CAP_BDP;
      let residual = 0;
      let undistributed = 0;

      if (R > capacity + 1e-6) { // tolleranza FP
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
        const importo = giorni > 0 ? clamp2(R / giorni) : 0;  // P2: uniforma importi
        
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
              plan: { d46: G46, d30: 0, val30: 0 } 
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
              plan: { d46: G46, d30: Gresto, val30 } 
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
  }, [businessTripData]);

  // Stable event handlers with useCallback
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
    setConversionDialog({ open: false, userId: '', userName: '', originalOvertimeHours: 0 });
    refetch();
  }, [refetch]);

  const handleMassConversionComplete = useCallback(() => {
    setMassConversionDialog({ open: false, userId: '', userName: '', companyId: '', workingDays: [] });
    refetch();
  }, [refetch]);

  // NOW SAFE TO HAVE CONDITIONAL RETURNS AFTER ALL HOOKS
  // Show loading skeleton while fetching
  if (isLoading) {
    return <BusinessTripSkeleton />;
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
            <p className="text-muted-foreground">Panoramica dettagliata delle trasferte mensili</p>
          </div>
        </div>
        <Card className="p-6">
          <div className="text-center">
            <p className="text-destructive mb-4">Errore durante il caricamento dei dati</p>
            <Button onClick={handleRefresh} variant="outline">
              Riprova
            </Button>
          </div>
        </Card>
      </div>
    );
  }

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

      {/* Summary Cards - Per Employee Breakdown */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Riepilogo per Dipendente</h2>
        <div className="grid grid-cols-1 gap-4">
          {employeeBreakdowns.map(breakdown => (
            <Card key={breakdown.employee_id} className="p-4">
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

                {breakdown.remainderDays > 0 && (
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-orange-700">Giorni €{breakdown.remainderPerDay.toFixed(2)}</p>
                        <p className="text-2xl font-bold text-orange-900">{breakdown.remainderDays}</p>
                      </div>
                      <TrendingDown className="h-8 w-8 text-orange-500" />
                    </div>
                    <p className="text-xs text-orange-600 mt-1">Tot: €{breakdown.remainderTotal.toFixed(2)}</p>
                  </div>
                )}

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
              {breakdown.needCapacityWarning && (
                <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-800">{breakdown.needCapacityWarning}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Summary Cards - Totals */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Riepilogo Mensile</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totale TS</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{totals.totalSaturdayAmount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {totals.totalSaturdayHours.toFixed(1)}h sabato
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totale TI</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{totals.totalDailyAllowanceAmount.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {totals.totalDailyAllowanceDays} giorni
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totale CS</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{totals.totalOvertimeConversions.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Conversioni straordinari
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Totale CB</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{totals.totalMealVoucherConversions.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Conversioni buoni
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dettaglio Giornaliero</CardTitle>
          <CardDescription>
            Visualizzazione completa delle ore lavorate e trasferte per ogni dipendente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[120px]">Dipendente</TableHead>
                  {daysMeta.map(({ d, dayName, isSunday, isSaturday, isHoliday }) => (
                    <TableHead
                      key={d}
                      className={`text-center text-xs p-1 min-w-[40px] ${
                        isSunday || isHoliday ? 'bg-red-50 text-red-700' : 
                        isSaturday ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs">{dayName}</span>
                        <span className="font-bold">{d}</span>
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-xs p-1 bg-purple-50 border-l">CB</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessTripData.map((employee) => (
                  <TableRow key={employee.employee_id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium text-sm p-2">
                      <div className="flex flex-col">
                        <span>{employee.employee_name}</span>
                        <div className="flex gap-2 mt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => handleOvertimeConversion(
                              employee.employee_id,
                              employee.employee_name,
                              employee.totals.overtime
                            )}
                          >
                            CS
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-6 px-2"
                            onClick={() => handleMassConversion(
                              employee.employee_id,
                              employee.employee_name,
                              employee.company_id
                            )}
                          >
                            CB
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    {daysMeta.map(({ d, dayKey, isSunday, isSaturday, isHoliday, dateStr }) => {
                      const dayData = employee.daily_data[dayKey];
                      const hasWorkedHours = dayData && (dayData.ordinary > 0 || dayData.overtime > 0);
                      const isConverted = employee.meal_voucher_conversions.daily_data[dayKey] || false;
                      
                      return (
                        <TableCell
                          key={d}
                          className={`text-center text-xs p-1 ${
                            isSunday || isHoliday ? 'bg-red-50' : 
                            isSaturday ? 'bg-blue-50' : ''
                          }`}
                        >
                          {hasWorkedHours && (
                            <Suspense fallback={null}>
                              <LazyDayConversionToggle
                                userId={employee.employee_id}
                                userName={employee.employee_name}
                                date={dateStr}
                                companyId={employee.company_id}
                                isConverted={isConverted}
                                onConversionUpdated={refetch}
                                size="sm"
                              />
                            </Suspense>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-bold text-purple-700 text-xs p-1 bg-gray-50 border-l">
                      {employee.meal_voucher_conversions.days}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <OvertimeConversionDialog
        open={conversionDialog.open}
        onOpenChange={(open) => {
          setConversionDialog(prev => ({ ...prev, open }));
          if (!open) {
            refetch(); // Refresh data when dialog closes
          }
        }}
        userId={conversionDialog.userId}
        userName={conversionDialog.userName}
        month={selectedMonth}
        originalOvertimeHours={conversionDialog.originalOvertimeHours}
      />

      <MassConversionDialog
        open={massConversionDialog.open}
        onOpenChange={(open) => {
          setMassConversionDialog(prev => ({ ...prev, open }));
          if (!open) {
            refetch(); // Refresh data when dialog closes
          }
        }}
        userId={massConversionDialog.userId}
        userName={massConversionDialog.userName}
        companyId={massConversionDialog.companyId}
        workingDays={massConversionDialog.workingDays}
        month={selectedMonth}
      />
    </div>
  );
};

export default BusinessTripsDashboard;