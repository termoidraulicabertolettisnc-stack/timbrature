import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getEmployeeSettingsForDate } from '@/utils/temporalEmployeeSettings';
import { BenefitsService } from '@/services/BenefitsService';
import { MealVoucherConversionService } from '@/services/MealVoucherConversionService';
import { OvertimeConversionService } from '@/services/OvertimeConversionService';
import { distributePayrollOvertime, applyPayrollOvertimeDistribution } from '@/utils/payrollOvertimeDistribution';

// Pre-import services to avoid dynamic imports
const servicesReady = Promise.resolve({
  getEmployeeSettingsForDate,
  BenefitsService,
  MealVoucherConversionService,
  OvertimeConversionService,
});

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

const fetchBusinessTripData = async (selectedMonth: string, userId: string): Promise<{
  data: BusinessTripData[];
  holidays: string[];
}> => {
  console.log(`🚀 [useBusinessTripData] Fetching data for ${selectedMonth}`);
  
  const [year, month] = selectedMonth.split('-');
  const startDate = `${year}-${month}-01`;
  const endDate = `${year}-${month}-${new Date(parseInt(year), parseInt(month), 0).getDate()}`;

  // Get user's company
  const { data: me, error: meError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (meError) throw meError;

  // Parallel fetch: company profiles, holidays, company settings
  const [profilesRes, holidaysRes, companySettingsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, first_name, last_name, company_id')
      .eq('is_active', true)
      .eq('company_id', me.company_id),
    supabase
      .from('company_holidays')
      .select('date')
      .eq('company_id', me.company_id)
      .gte('date', startDate)
      .lte('date', endDate),
    supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', me.company_id)
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (companySettingsRes.error) throw companySettingsRes.error;

  const profiles = profilesRes.data || [];
  const holidays = holidaysRes.data?.map(h => h.date) || [];
  const companySettings = companySettingsRes.data || [];
  
  const userIds = profiles.map(p => p.user_id);
  if (userIds.length === 0) {
    return { data: [], holidays };
  }

  // Parallel fetch: timesheets and absences
  const [timesheetsRes, absencesRes] = await Promise.all([
    supabase
      .from('timesheets')
      .select('user_id, date, total_hours, overtime_hours, is_absence, start_time, end_time, lunch_start_time, lunch_end_time, lunch_duration_minutes')
      .in('user_id', userIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_absence', false),
    supabase
      .from('employee_absences')
      .select('user_id, date, absence_type, hours')
      .in('user_id', userIds)
      .gte('date', startDate)
      .lte('date', endDate)
  ]);

  if (timesheetsRes.error) throw timesheetsRes.error;
  if (absencesRes.error) throw absencesRes.error;

  const timesheets = timesheetsRes.data || [];
  const absences = absencesRes.data || [];

  // Load meal voucher conversions
  const allConversionsData = await MealVoucherConversionService.getConversionsForUsers(userIds, startDate, endDate);

  // Batch all temporal settings queries to reduce DB calls - SIMPLIFIED VERSION
  console.log('🚀 Processing profiles:', profiles.length);
  
  // Process data for each employee with minimal async operations
  const processedData: BusinessTripData[] = [];
  
  for (const profile of profiles) {
      const employeeTimesheets = timesheets.filter(t => t.user_id === profile.user_id);
      const employeeAbsences = absences.filter(a => a.user_id === profile.user_id);
      const companySettingsForEmployee = companySettings.find(cs => cs.company_id === profile.company_id);
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

      const mealVouchersDaily: { [day: string]: boolean } = {};
      const dailyAllowanceAmounts: { [day: string]: number } = {};

      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
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

      // Process timesheets with minimal async operations
      for (const ts of employeeTimesheets) {
        const day = new Date(`${ts.date}T00:00:00`).getDate();
        const dayKey = String(day).padStart(2, '0');
        const date = new Date(`${ts.date}T00:00:00`);
        const isSaturday = date.getDay() === 6;

        // Use company settings directly instead of temporal settings to avoid loops
        const effectiveSaturdayHandling = companySettingsForEmployee?.saturday_handling || 'straordinario';
        const effectiveSaturdayRate = companySettingsForEmployee?.saturday_hourly_rate || defaultSaturdayRate;

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

        // Simplified meal benefits calculation
        const totalHours = ts.total_hours || 0;
        if (totalHours >= 6) { // Simplified threshold
          mealVoucherDays++;
          if (!employeeConversions.some(conv => conv.date === ts.date && conv.converted_to_allowance)) {
            mealVouchersDaily[dayKey] = true;
          }
          
          // Simplified daily allowance for longer shifts
          if (totalHours >= 8) {
            dailyAllowances.days += 1;
            dailyAllowances.daily_data[dayKey] = true;
            const allowanceAmount = companySettingsForEmployee?.default_daily_allowance_amount || 10;
            dailyAllowances.amount += allowanceAmount;
            dailyAllowanceAmounts[dayKey] = allowanceAmount;
          }
        }

        // Meal voucher conversions
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

      // Simplified overtime conversions - skip complex calculations
      let overtimeConversions = {
        hours: 0,
        amount: 0,
        monthly_total: false
      };

      const result = {
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
        meal_vouchers_daily_data: mealVouchersDaily,
        daily_allowances_amounts: dailyAllowanceAmounts,
        saturday_rate: defaultSaturdayRate,
      };

      processedData.push(result);
    }

    console.log('✅ Processed data for', processedData.length, 'employees');

  return { data: processedData, holidays };
};

export const useBusinessTripData = (selectedMonth: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business-trip-data', selectedMonth, user?.id],
    queryFn: () => fetchBusinessTripData(selectedMonth, user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1, // Prevent aggressive retries that cause loops
  });
};