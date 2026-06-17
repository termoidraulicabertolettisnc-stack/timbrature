import { useCallback } from "react";
import {
  format,
  parseISO,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from "date-fns";
import type { AdminTimesheetsView } from "@/utils/timesheetViewState";

interface UseTimesheetNavigationArgs {
  activeView: AdminTimesheetsView;
  dateFilter: string;
  setDateFilter: (date: string) => void;
}

export function useTimesheetNavigation({
  activeView,
  dateFilter,
  setDateFilter,
}: UseTimesheetNavigationArgs) {
  const navigateToToday = useCallback(() => {
    setDateFilter(format(new Date(), "yyyy-MM-dd"));
  }, [setDateFilter]);

  const navigatePrevious = useCallback(() => {
    const currentDate = parseISO(dateFilter);
    let newDate: Date;
    switch (activeView) {
      case "weekly":
        newDate = subWeeks(currentDate, 1);
        break;
      case "monthly":
        newDate = subMonths(currentDate, 1);
        break;
      default:
        newDate = subDays(currentDate, 1);
    }
    setDateFilter(format(newDate, "yyyy-MM-dd"));
  }, [activeView, dateFilter, setDateFilter]);

  const navigateNext = useCallback(() => {
    const currentDate = parseISO(dateFilter);
    let newDate: Date;
    switch (activeView) {
      case "weekly":
        newDate = addWeeks(currentDate, 1);
        break;
      case "monthly":
        newDate = addMonths(currentDate, 1);
        break;
      default:
        newDate = addDays(currentDate, 1);
    }
    setDateFilter(format(newDate, "yyyy-MM-dd"));
  }, [activeView, dateFilter, setDateFilter]);

  return { navigateToToday, navigatePrevious, navigateNext };
}
