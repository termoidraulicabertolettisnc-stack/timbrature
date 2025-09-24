import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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
  saturday_trips: {
    hours: number;
    amount: number;
    daily_data: {
      [day: string]: number;
    };
  };
  daily_allowances: {
    days: number;
    amount: number;
    daily_data: {
      [day: string]: boolean;
    };
  };
  overtime_conversions: {
    hours: number;
    amount: number;
    monthly_total: boolean;
  };
  meal_voucher_conversions: {
    days: number;
    amount: number;
    daily_data: {
      [day: string]: boolean;
    };
  };
  meal_vouchers_daily_data: {
    [day: string]: boolean;
  };
  daily_allowances_amounts: {
    [day: string]: number;
  };
  saturday_rate?: number;
}

interface CacheEntry {
  data: BusinessTripData[];
  holidays: string[];
  timestamp: number;
  dataHash: string;
  isValid: boolean;
}

interface CacheState {
  [month: string]: CacheEntry;
}

export const useBusinessTripsCache = (selectedMonth: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [cache, setCache] = useState<CacheState>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastCalculated, setLastCalculated] = useState<number | null>(null);
  const [hasRealtimeError, setHasRealtimeError] = useState(false);
  
  const subscriptionsRef = useRef<any[]>([]);
  const calculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create hash of source data for change detection
  const createDataHash = useCallback(async (month: string): Promise<string> => {
    if (!user) return '';
    
    try {
      const [year, monthNum] = month.split('-');
      const startDate = `${year}-${monthNum}-01`;
      const endDate = `${year}-${monthNum}-${new Date(parseInt(year), parseInt(monthNum), 0).getDate()}`;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
        
      if (!profile) return '';

      const [timesheets, absences, settings, conversions, holidays] = await Promise.all([
        supabase
          .from('timesheets')
          .select('user_id, date, total_hours, overtime_hours, updated_at')
          .eq('is_absence', false)
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('employee_absences')
          .select('user_id, date, absence_type, hours, updated_at')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('employee_settings')
          .select('user_id, updated_at, saturday_handling, saturday_hourly_rate')
          .lte('valid_from', endDate)
          .or(`valid_to.is.null,valid_to.gte.${startDate}`),
        supabase
          .from('employee_meal_voucher_conversions')
          .select('user_id, date, updated_at')
          .gte('date', startDate)
          .lte('date', endDate),
        supabase
          .from('company_holidays')
          .select('date, updated_at')
          .eq('company_id', profile.company_id)
          .gte('date', startDate)
          .lte('date', endDate)
      ]);

      const hashData = {
        timesheets: timesheets.data || [],
        absences: absences.data || [],
        settings: settings.data || [],
        conversions: conversions.data || [],
        holidays: holidays.data || []
      };

      return btoa(JSON.stringify(hashData)).slice(0, 32);
    } catch (error) {
      console.error('Error creating data hash:', error);
      return '';
    }
  }, [user]);

  // Calculate business trip data (extracted from original component)
  const calculateBusinessTripData = useCallback(async (month: string): Promise<{ data: BusinessTripData[], holidays: string[] }> => {
    if (!user) return { data: [], holidays: [] };
    
    console.log(`🚀 [Cache] Calculating data for ${month}`);
    
    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    const endDate = `${year}-${monthNum}-${new Date(parseInt(year), parseInt(monthNum), 0).getDate()}`;

    // Get user's company
    const { data: me, error: meError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    if (meError) throw meError;

    // Fetch holidays
    const { data: holidayData } = await supabase
      .from('company_holidays')
      .select('date')
      .eq('company_id', me.company_id)
      .gte('date', startDate)
      .lte('date', endDate);
    const holidays = holidayData?.map(h => h.date) || [];

    // Fetch all employees in company
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, company_id')
      .eq('is_active', true)
      .eq('company_id', me.company_id);
    const profiles = profilesData || [];
    const userIds = profiles.map(p => p.user_id);

    if (userIds.length === 0) return { data: [], holidays };

    // Fetch all necessary data
    const [timesheets, absences, companySettings] = await Promise.all([
      supabase
        .from('timesheets')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('is_absence', false),
      supabase
        .from('employee_absences')
        .select('*')
        .in('user_id', userIds)
        .gte('date', startDate)
        .lte('date', endDate),
      supabase
        .from('company_settings')
        .select('*')
        .in('company_id', profiles.map(p => p.company_id))
    ]);

    // Import required services
    const [{ getEmployeeSettingsForDate }, { BenefitsService }, { MealVoucherConversionService }, { OvertimeConversionService }] = await Promise.all([
      import('@/utils/temporalEmployeeSettings'),
      import('@/services/BenefitsService'),
      import('@/services/MealVoucherConversionService'),
      import('@/services/OvertimeConversionService')
    ]);

    // Load meal voucher conversions
    const allConversionsData = await MealVoucherConversionService.getConversionsForUsers(userIds, startDate, endDate);

    // Process data for each employee (simplified version of original logic)
    const processedData: BusinessTripData[] = await Promise.all(profiles.map(async profile => {
      const employeeTimesheets = (timesheets.data || []).filter(t => t.user_id === profile.user_id);
      const employeeAbsences = (absences.data || []).filter(a => a.user_id === profile.user_id);
      const companySettingsForEmployee = companySettings.data?.find(cs => cs.company_id === profile.company_id);
      const employeeConversions = allConversionsData[profile.user_id] || [];

      const dailyData: BusinessTripData['daily_data'] = {};
      let totalOrdinary = 0;
      let totalOvertime = 0;
      let absenceTotals: Record<string, number> = {};
      let mealVoucherDays = 0;

      const saturdayTrips = { hours: 0, amount: 0, daily_data: {} as { [day: string]: number } };
      const dailyAllowances = { days: 0, amount: 0, daily_data: {} as { [day: string]: boolean } };
      const mealVoucherConversions = { days: 0, amount: 0, daily_data: {} as { [day: string]: boolean } };
      const mealVouchersDaily: { [day: string]: boolean } = {};
      const dailyAllowanceAmounts: { [day: string]: number } = {};

      const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day).padStart(2, '0');
        dailyData[dayKey] = { ordinary: 0, overtime: 0, absence: null };
        saturdayTrips.daily_data[dayKey] = 0;
        dailyAllowances.daily_data[dayKey] = false;
        mealVoucherConversions.daily_data[dayKey] = false;
        mealVouchersDaily[dayKey] = false;
        dailyAllowanceAmounts[dayKey] = 0;
      }

      const defaultSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || 10;
      const defaultMealVoucherAmount = companySettingsForEmployee?.meal_voucher_amount || 8.0;

      // Process timesheets
      for (const ts of employeeTimesheets) {
        const day = new Date(`${ts.date}T00:00:00`).getDate();
        const dayKey = String(day).padStart(2, '0');
        const date = new Date(`${ts.date}T00:00:00`);
        const isSaturday = date.getDay() === 6;
        
        const temporalSettings = await getEmployeeSettingsForDate(ts.user_id, ts.date);
        const effectiveSaturdayHandling = temporalSettings?.saturday_handling || companySettingsForEmployee?.saturday_handling || 'straordinario';
        const effectiveSaturdayRate = temporalSettings?.saturday_hourly_rate || defaultSaturdayRate;

        if (isSaturday && effectiveSaturdayHandling === 'trasferta') {
          const hours = ts.total_hours || 0;
          saturdayTrips.hours += hours;
          saturdayTrips.amount += hours * effectiveSaturdayRate;
          saturdayTrips.daily_data[dayKey] = hours;
        } else {
          const overtime = ts.overtime_hours || 0;
          const ordinary = Math.max(0, (ts.total_hours || 0) - overtime);
          dailyData[dayKey].ordinary = ordinary;
          dailyData[dayKey].overtime = overtime;
          totalOrdinary += ordinary;
          totalOvertime += overtime;
        }

        // Calculate meal benefits
        const mealBenefits = await BenefitsService.calculateMealBenefits(
          ts,
          temporalSettings ? {
            meal_allowance_policy: temporalSettings.meal_allowance_policy,
            meal_voucher_min_hours: temporalSettings.meal_voucher_min_hours,
            daily_allowance_min_hours: temporalSettings.daily_allowance_min_hours,
            lunch_break_type: temporalSettings.lunch_break_type,
            saturday_handling: temporalSettings.saturday_handling
          } : undefined,
          companySettingsForEmployee,
          ts.date
        );

        if (mealBenefits.dailyAllowance) {
          dailyAllowances.days += 1;
          dailyAllowances.daily_data[dayKey] = true;
          const effectiveDailyAllowanceAmount = mealBenefits.dailyAllowanceAmount || 
            temporalSettings?.daily_allowance_amount || 
            companySettingsForEmployee?.default_daily_allowance_amount || 10;
          dailyAllowances.amount += effectiveDailyAllowanceAmount;
          dailyAllowanceAmounts[dayKey] = effectiveDailyAllowanceAmount;
        }

        if (mealBenefits.mealVoucher) {
          mealVoucherDays++;
          if (!employeeConversions.some(conv => conv.date === ts.date && conv.converted_to_allowance)) {
            mealVouchersDaily[dayKey] = true;
          }
        }

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

      // Calculate overtime conversions
      let overtimeConversions = { hours: 0, amount: 0, monthly_total: false };
      let finalDailyData = dailyData;
      let finalOvertimeTotal = totalOvertime;

      try {
        const conversionCalc = await OvertimeConversionService.calculateConversionDetails(profile.user_id, month, totalOvertime);
        if (conversionCalc.converted_hours > 0) {
          overtimeConversions.hours = conversionCalc.converted_hours;
          overtimeConversions.amount = conversionCalc.conversion_amount;
          overtimeConversions.monthly_total = true;

          // Apply conversion distribution
          const { distributePayrollOvertime, applyPayrollOvertimeDistribution } = await import('@/utils/payrollOvertimeDistribution');
          const distributions = distributePayrollOvertime(dailyData, conversionCalc.converted_hours);
          finalDailyData = applyPayrollOvertimeDistribution(dailyData, distributions);
          finalOvertimeTotal = Object.values(finalDailyData).reduce((sum, data) => sum + (data.overtime || 0), 0);
        }
      } catch (e) {
        console.warn('Conversion calc error', profile.user_id, e);
      }

      return {
        employee_id: profile.user_id,
        employee_name: `${profile.first_name} ${profile.last_name}`,
        company_id: profile.company_id,
        daily_data: finalDailyData,
        totals: {
          ordinary: totalOrdinary,
          overtime: finalOvertimeTotal,
          absence_totals: absenceTotals
        },
        meal_vouchers: mealVoucherDays,
        meal_voucher_amount: mealVoucherDays * defaultMealVoucherAmount,
        saturday_trips: saturdayTrips,
        daily_allowances: dailyAllowances,
        overtime_conversions: overtimeConversions,
        meal_voucher_conversions: mealVoucherConversions,
        meal_vouchers_daily_data: mealVouchersDaily,
        daily_allowances_amounts: dailyAllowanceAmounts,
        saturday_rate: defaultSaturdayRate
      };
    }));

    console.log(`✅ [Cache] Data calculated for ${month}:`, processedData.length, 'employees');
    return { data: processedData, holidays };
  }, [user]);

  // Setup realtime subscriptions for auto-invalidation
  const setupRealtimeSubscriptions = useCallback(() => {
    if (!user) return;

    // Clear existing subscriptions
    subscriptionsRef.current.forEach(sub => sub?.unsubscribe());
    subscriptionsRef.current = [];

    const tables = ['timesheets', 'employee_absences', 'employee_settings', 'employee_meal_voucher_conversions', 'overtime_conversions', 'company_holidays'];
    
    tables.forEach(tableName => {
      const channel = supabase
        .channel(`business-trips-${tableName}-changes`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: tableName },
          (payload) => {
            console.log(`📡 [Cache] Change detected in ${tableName}:`, payload);
            
            // Debounced invalidation - wait for multiple changes to settle
            if (calculationTimeoutRef.current) {
              clearTimeout(calculationTimeoutRef.current);
            }
            
            calculationTimeoutRef.current = setTimeout(() => {
              invalidateCache();
              triggerRecalculation();
            }, 2000); // Wait 2 seconds for changes to settle
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [Cache] Subscribed to ${tableName} changes`);
            setHasRealtimeError(false);
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [Cache] Error subscribing to ${tableName}`);
            setHasRealtimeError(true);
          }
        });
      
      subscriptionsRef.current.push(channel);
    });
  }, [user]);

  // Invalidate cache for current month
  const invalidateCache = useCallback(() => {
    setCache(prev => ({
      ...prev,
      [selectedMonth]: prev[selectedMonth] ? { ...prev[selectedMonth], isValid: false } : prev[selectedMonth]
    }));
  }, [selectedMonth]);

  // Trigger background recalculation
  const triggerRecalculation = useCallback(async () => {
    if (isCalculating) return;
    
    try {
      setIsCalculating(true);
      const newHash = await createDataHash(selectedMonth);
      const currentEntry = cache[selectedMonth];
      
      // Only recalculate if data has actually changed
      if (currentEntry && currentEntry.dataHash === newHash) {
        console.log(`📊 [Cache] Data unchanged for ${selectedMonth}, marking valid`);
        setCache(prev => ({
          ...prev,
          [selectedMonth]: { ...currentEntry, isValid: true }
        }));
        return;
      }
      
      console.log(`🔄 [Cache] Recalculating data for ${selectedMonth}`);
      const result = await calculateBusinessTripData(selectedMonth);
      
      setCache(prev => ({
        ...prev,
        [selectedMonth]: {
          data: result.data,
          holidays: result.holidays,
          timestamp: Date.now(),
          dataHash: newHash,
          isValid: true
        }
      }));
      
      setLastCalculated(Date.now());
      
      toast({
        title: "Dati aggiornati",
        description: `Trasferte aggiornate per ${selectedMonth}`,
      });
      
    } catch (error) {
      console.error('❌ [Cache] Recalculation error:', error);
      toast({
        title: "Errore aggiornamento",
        description: "Errore durante l'aggiornamento dei dati",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  }, [selectedMonth, cache, isCalculating, createDataHash, calculateBusinessTripData, toast]);

  // Manual recalculation (user triggered)
  const recalculate = useCallback(async () => {
    console.log(`🔧 [Cache] Manual recalculation triggered for ${selectedMonth}`);
    invalidateCache();
    await triggerRecalculation();
  }, [selectedMonth, invalidateCache, triggerRecalculation]);

  // Get cached data or return empty state
  const getCachedData = useCallback(() => {
    const entry = cache[selectedMonth];
    if (entry && entry.isValid) {
      return {
        data: entry.data,
        holidays: entry.holidays,
        isFromCache: true,
        lastCalculated: entry.timestamp
      };
    }
    return {
      data: [],
      holidays: [],
      isFromCache: false,
      lastCalculated: null
    };
  }, [cache, selectedMonth]);

  // Initialize cache and subscriptions
  useEffect(() => {
    setupRealtimeSubscriptions();
    return () => {
      subscriptionsRef.current.forEach(sub => sub?.unsubscribe());
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
      }
    };
  }, [setupRealtimeSubscriptions]);

  // Auto-calculate on month change if no valid cache exists
  useEffect(() => {
    const entry = cache[selectedMonth];
    if (!entry || !entry.isValid) {
      triggerRecalculation();
    }
  }, [selectedMonth, cache, triggerRecalculation]);

  // Cleanup old cache entries (keep only last 3 months)
  useEffect(() => {
    const cacheKeys = Object.keys(cache);
    if (cacheKeys.length > 3) {
      const sortedKeys = cacheKeys.sort();
      const keysToRemove = sortedKeys.slice(0, -3);
      
      setCache(prev => {
        const newCache = { ...prev };
        keysToRemove.forEach(key => delete newCache[key]);
        return newCache;
      });
    }
  }, [cache]);

  return {
    getCachedData,
    recalculate,
    isCalculating,
    lastCalculated,
    hasRealtimeError,
    cacheStatus: {
      hasValidCache: cache[selectedMonth]?.isValid || false,
      cacheTimestamp: cache[selectedMonth]?.timestamp || null,
      totalCachedMonths: Object.keys(cache).length
    }
  };
};
