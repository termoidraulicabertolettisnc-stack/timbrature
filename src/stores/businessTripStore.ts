import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface BusinessTripStore {
  data: BusinessTripData[];
  holidays: string[];
  selectedMonth: string;
  lastFetch: number;
  setData: (data: BusinessTripData[]) => void;
  setHolidays: (holidays: string[]) => void;
  setSelectedMonth: (month: string) => void;
  isDataStale: (companyId: string, month: string) => boolean;
  clearCache: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useBusinessTripStore = create<BusinessTripStore>()(
  persist(
    (set, get) => ({
      data: [],
      holidays: [],
      selectedMonth: (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      })(),
      lastFetch: 0,
      
      setData: (data) => set({ data, lastFetch: Date.now() }),
      setHolidays: (holidays) => set({ holidays }),
      setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
      
      isDataStale: (companyId: string, month: string) => {
        const state = get();
        const timeSinceLastFetch = Date.now() - state.lastFetch;
        const isExpired = timeSinceLastFetch > CACHE_DURATION;
        const isDifferentMonth = state.selectedMonth !== month;
        return isExpired || isDifferentMonth || state.data.length === 0;
      },
      
      clearCache: () => set({ data: [], holidays: [], lastFetch: 0 }),
    }),
    {
      name: 'business-trip-cache',
      partialize: (state) => ({
        data: state.data,
        holidays: state.holidays,
        selectedMonth: state.selectedMonth,
        lastFetch: state.lastFetch,
      }),
    }
  )
);