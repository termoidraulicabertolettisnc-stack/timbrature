'use client'

import React, { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBusinessTripData } from '@/hooks/useBusinessTripData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Download, Users, MapPin, TrendingDown, Loader2 } from "lucide-react";
import { BusinessTripSkeleton } from '@/components/ui/business-trip-skeleton';
import { Badge } from "@/components/ui/badge";

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
  saturday_trips: {
    hours: number;
    amount: number;
    daily_data: { [day: string]: number };
  };
  daily_allowances: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean };
  };
  overtime_conversions: {
    hours: number;
    amount: number;
    monthly_total: boolean;
  };
  meal_voucher_conversions: {
    days: number;
    amount: number;
    daily_data: { [day: string]: boolean };
  };
  meal_vouchers_daily_data: { [day: string]: boolean };
  daily_allowances_amounts: { [day: string]: number };
  saturday_rate?: number;
}

const OptimizedBusinessTripsDashboard = () => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: queryData, isLoading, error, refetch } = useBusinessTripData(selectedMonth);
  
  const businessTripData = queryData?.data || [];
  const holidays = queryData?.holidays || [];

  // Pre-calculate summary data efficiently
  const summaryData = useMemo(() => {
    if (!businessTripData.length) return null;

    let totalSaturdayAmount = 0;
    let totalDailyAllowanceAmount = 0;
    let totalOvertimeConversions = 0;
    let totalMealVoucherConversions = 0;
    
    // Process employee breakdowns with simplified CAP algorithm
    const employeeBreakdowns = businessTripData.map(emp => {
      const CAP_STD = 46.48;
      const CAP_BDP = 30.98;

      const TS_total = emp.saturday_trips.amount || 0;
      const TI_total = emp.daily_allowances.amount || 0;
      const CS_total = emp.overtime_conversions.amount || 0;
      const CB_total = emp.meal_voucher_conversions.amount || 0;
      const R = TS_total + TI_total + CS_total + CB_total;

      // Count eligible days (simplified)
      let A46 = 0; // days without meal vouchers
      let A30 = 0; // days with meal vouchers
      
      Object.keys(emp.daily_data).forEach(d => {
        const w = emp.daily_data[d];
        const worked = w && (w.ordinary + w.overtime) > 0 && !w.absence;
        if (!worked) return;

        const hasBDP = emp.meal_vouchers_daily_data?.[d] || false;
        if (hasBDP) {
          A30 += 1;
        } else {
          A46 += 1;
        }
      });

      // Simplified distribution algorithm
      let daysAt46_48 = 0;
      let amountAt46_48 = 0;
      let remainderDays = 0;
      let remainderPerDay = 0;

      const totalDays = A46 + A30;
      if (totalDays > 0 && R > 0) {
        // Simple uniform distribution
        const avgPerDay = R / totalDays;
        if (avgPerDay <= CAP_BDP) {
          // All days at CAP_BDP rate
          remainderDays = totalDays;
          remainderPerDay = Math.min(avgPerDay, CAP_BDP);
        } else if (avgPerDay <= CAP_STD && A46 > 0) {
          // All days at CAP_STD rate
          daysAt46_48 = totalDays;
          amountAt46_48 = R;
        } else {
          // Mixed distribution - prioritize A46 days at full rate
          const maxA46Amount = A46 * CAP_STD;
          if (R <= maxA46Amount) {
            daysAt46_48 = Math.ceil(R / CAP_STD);
            amountAt46_48 = R;
          } else {
            daysAt46_48 = A46;
            amountAt46_48 = maxA46Amount;
            const remaining = R - maxA46Amount;
            remainderDays = A30;
            remainderPerDay = A30 > 0 ? Math.min(remaining / A30, CAP_BDP) : 0;
          }
        }
      }

      const ledgerTotal = amountAt46_48 + (remainderPerDay * remainderDays);

      // Update totals
      totalSaturdayAmount += TS_total;
      totalDailyAllowanceAmount += TI_total;
      totalOvertimeConversions += CS_total;
      totalMealVoucherConversions += CB_total;

      return {
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        daysAt46_48: Math.round(daysAt46_48),
        amountAt46_48: Math.round(amountAt46_48 * 100) / 100,
        remainderDays: Math.round(remainderDays),
        remainderPerDay: Math.round(remainderPerDay * 100) / 100,
        remainderTotal: Math.round((remainderPerDay * remainderDays) * 100) / 100,
        ledgerTotal: Math.round(ledgerTotal * 100) / 100,
        components: {
          saturday_trips: TS_total,
          daily_allowances: TI_total,
          overtime_conversions: CS_total,
          meal_voucher_conversions: CB_total
        },
        totalEligibleDays: A46 + A30,
        eligibleA46: A46,
        eligibleA30: A30
      };
    });

    const grandTotal = totalSaturdayAmount + totalDailyAllowanceAmount + totalOvertimeConversions + totalMealVoucherConversions;

    return {
      employeeBreakdowns,
      totals: {
        totalSaturdayAmount: Math.round(totalSaturdayAmount * 100) / 100,
        totalDailyAllowanceAmount: Math.round(totalDailyAllowanceAmount * 100) / 100,
        totalOvertimeConversions: Math.round(totalOvertimeConversions * 100) / 100,
        totalMealVoucherConversions: Math.round(totalMealVoucherConversions * 100) / 100,
        grandTotal: Math.round(grandTotal * 100) / 100
      }
    };
  }, [businessTripData]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return <BusinessTripSkeleton />;
  }

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

  if (!summaryData) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
            <p className="text-muted-foreground">Nessun dato disponibile per il mese selezionato</p>
          </div>
        </div>
      </div>
    );
  }

  const { employeeBreakdowns, totals } = summaryData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trasferte e Indennità</h1>
          <p className="text-muted-foreground">Panoramica ottimizzata delle trasferte mensili</p>
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

      {/* Summary Cards - Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale TS</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totals.totalSaturdayAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Trasferte sabato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale TI</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totals.totalDailyAllowanceAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Trasferte indennità</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale CS</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totals.totalOvertimeConversions.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Conversioni straordinari</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totale CB</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totals.totalMealVoucherConversions.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Conversioni buoni</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee Breakdown Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Riepilogo per Dipendente</h2>
        <div className="grid grid-cols-1 gap-4">
          {employeeBreakdowns.map(breakdown => (
            <Card key={breakdown.employee_id} className="p-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">{breakdown.employee_name}</h3>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">€{breakdown.ledgerTotal.toFixed(2)}</div>
                  <p className="text-sm text-muted-foreground">Totale trasferte</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {breakdown.daysAt46_48 > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-700">€46.48</p>
                        <p className="text-xl font-bold text-blue-900">{breakdown.daysAt46_48}</p>
                      </div>
                      <MapPin className="h-6 w-6 text-blue-500" />
                    </div>
                    <p className="text-xs text-blue-600 mt-1">€{breakdown.amountAt46_48.toFixed(2)}</p>
                  </div>
                )}

                {breakdown.remainderDays > 0 && (
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-orange-700">€{breakdown.remainderPerDay.toFixed(2)}</p>
                        <p className="text-xl font-bold text-orange-900">{breakdown.remainderDays}</p>
                      </div>
                      <TrendingDown className="h-6 w-6 text-orange-500" />
                    </div>
                    <p className="text-xs text-orange-600 mt-1">€{breakdown.remainderTotal.toFixed(2)}</p>
                  </div>
                )}

                <div className="bg-emerald-50 rounded-lg p-3">
                  <div className="text-xs text-emerald-600 space-y-1">
                    <div className="font-medium text-emerald-700 mb-2">Componenti</div>
                    {breakdown.components.saturday_trips > 0 && <Badge variant="outline" className="text-xs">TS: €{breakdown.components.saturday_trips.toFixed(2)}</Badge>}
                    {breakdown.components.daily_allowances > 0 && <Badge variant="outline" className="text-xs">TI: €{breakdown.components.daily_allowances.toFixed(2)}</Badge>}
                    {breakdown.components.overtime_conversions > 0 && <Badge variant="outline" className="text-xs">CS: €{breakdown.components.overtime_conversions.toFixed(2)}</Badge>}
                    {breakdown.components.meal_voucher_conversions > 0 && <Badge variant="outline" className="text-xs">CB: €{breakdown.components.meal_voucher_conversions.toFixed(2)}</Badge>}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Giorni Totali</p>
                      <p className="text-xl font-bold text-gray-900">{breakdown.totalEligibleDays}</p>
                    </div>
                    <Calendar className="h-6 w-6 text-gray-500" />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    €46.48: {breakdown.eligibleA46} | €30.98: {breakdown.eligibleA30}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Grand Total */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="text-center">Totale Generale Mensile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="text-4xl font-bold text-primary mb-2">€{totals.grandTotal.toFixed(2)}</div>
            <p className="text-muted-foreground">Importo complessivo trasferte {selectedMonth}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OptimizedBusinessTripsDashboard;