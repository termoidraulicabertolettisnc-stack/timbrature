import { format } from "date-fns";

export type AdminTimesheetsView = "daily" | "weekly" | "monthly";

export const TIMESHEET_VIEW_STATE_KEY = "admin-timesheets-view-state";

export interface AdminTimesheetsViewState {
  activeView: AdminTimesheetsView;
  dateFilter: string;
}

export const getSavedTimesheetViewState = (): AdminTimesheetsViewState => {
  const fallback: AdminTimesheetsViewState = {
    activeView: "daily",
    dateFilter: format(new Date(), "yyyy-MM-dd"),
  };

  try {
    const saved = sessionStorage.getItem(TIMESHEET_VIEW_STATE_KEY);
    if (!saved) return fallback;

    const parsed = JSON.parse(saved) as { activeView?: string; dateFilter?: string };
    return {
      activeView: ["daily", "weekly", "monthly"].includes(parsed.activeView || "")
        ? (parsed.activeView as AdminTimesheetsView)
        : fallback.activeView,
      dateFilter: /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateFilter || "")
        ? parsed.dateFilter!
        : fallback.dateFilter,
    };
  } catch {
    return fallback;
  }
};

export const persistTimesheetViewState = (state: AdminTimesheetsViewState) => {
  try {
    sessionStorage.setItem(TIMESHEET_VIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // Non bloccare la pagina se il browser impedisce sessionStorage.
  }
};
