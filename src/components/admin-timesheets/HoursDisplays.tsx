import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatHoursDecimal } from "@/utils/italianFormat";
import { useRealtimeHours } from "@/hooks/use-realtime-hours";
import { calcNightMinutesLocal } from "@/utils/nightHours";
import { getEmployeeSettingsForDate } from "@/utils/temporalEmployeeSettings";
import type { ExtendedTimesheetWithProfile } from "@/utils/timesheetIdUtils";

export interface EmployeeSummary {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  regular_hours: number;
  meal_vouchers: number;
  saturday_hours?: number;
  holiday_hours?: number;
  total_sessions?: number;
  timesheets: ExtendedTimesheetWithProfile[];
}

export function HoursDisplayMultiSessionFixed({ session }: { session: any }) {
  const realtimeHours = useRealtimeHours(session);
  const [rtNightHours, setRtNightHours] = useState<number>(0);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!session.start_time || session.end_time) {
        setRtNightHours(0);
        return;
      }
      const settings = await getEmployeeSettingsForDate(session.user_id, session.date);
      const ns = settings?.night_shift_start || "22:00:00";
      const ne = settings?.night_shift_end || "05:00:00";
      const start = new Date(session.start_time);
      const now = new Date();
      const mins = calcNightMinutesLocal(start, now, ns, ne, "Europe/Rome");
      if (active) setRtNightHours(mins / 60);
    };

    run();
    const id = setInterval(run, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [session.start_time, session.end_time, session.user_id, session.date]);

  const formatHours = (hours: number | null) => formatHoursDecimal(hours);

  if (!session.end_time && session.start_time) {
    return (
      <span className="text-blue-600">
        {formatHours(realtimeHours)} (in corso)
        {rtNightHours > 0 && (
          <span className="text-xs text-blue-700 ml-1">• notturne {rtNightHours.toFixed(1)}h</span>
        )}
        {session.is_session && (
          <span className="text-xs text-purple-700 ml-1">
            • sessione #{session.session_order || 1}
          </span>
        )}
      </span>
    );
  }

  return (
    <span>
      {formatHours(session.session_hours || session.total_hours)}
      {session.night_hours && session.night_hours > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          • notturne {session.night_hours.toFixed(1)}h
        </span>
      )}
      {session.is_session && (
        <Badge variant="outline" className="ml-2 text-xs">
          Sessione #{session.session_order || 1}
          {session.session_type && ` (${session.session_type})`}
        </Badge>
      )}
    </span>
  );
}

export const HoursDisplayFixed = ({
  employee,
}: {
  employee: EmployeeSummary;
  standardDailyHours?: number;
}) => {
  const formatHours = (hours: number) => formatHoursDecimal(hours);

  return (
    <div className="space-y-1">
      <div className="text-sm">
        <span className="font-medium">Totale: </span>
        <Badge variant="secondary">{formatHours(employee.total_hours)}</Badge>
      </div>

      <div className="text-xs text-gray-600">
        <span>Ordinarie: </span>
        <span className="text-green-600">{formatHours(employee.regular_hours)}</span>

        {employee.overtime_hours > 0 && (
          <>
            <span className="mx-1">•</span>
            <span>Straordinari: </span>
            <span className="text-orange-600 font-medium">
              {formatHours(employee.overtime_hours)}
            </span>
          </>
        )}

        {employee.night_hours > 0 && (
          <>
            <span className="mx-1">•</span>
            <span>Notturne: </span>
            <span className="text-blue-600">{formatHours(employee.night_hours)}</span>
          </>
        )}
      </div>

      {employee.meal_vouchers > 0 && (
        <div className="text-xs">
          <Badge variant="outline" className="text-xs">
            {employee.meal_vouchers} buoni pasto
          </Badge>
        </div>
      )}
    </div>
  );
};
