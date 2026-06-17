import { supabase } from "@/integrations/supabase/client";
import { TimesheetWithProfile } from "@/types/timesheet";

// Estende il tipo timesheet per supportare le proprietà delle sessioni multiple
export interface ExtendedTimesheetWithProfile extends TimesheetWithProfile {
  session_hours?: number;
  session_type?: string;
  session_notes?: string;
  session_order?: number;
  is_session?: boolean;
  original_timesheet_id?: string;
}

// Estrae UUID reale da un id composito (timesheet o sessione)
export const extractRealTimesheetId = (compositeId: string): string => {
  console.log("🔧 EXTRACT UUID - Input:", compositeId);

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(compositeId)) {
    console.log("🔧 EXTRACT UUID - Already valid:", compositeId);
    return compositeId;
  }

  const potentialUuids = compositeId.split(/[-_]/);
  for (let i = 0; i <= potentialUuids.length - 5; i++) {
    const candidate = potentialUuids.slice(i, i + 5).join("-");
    if (uuidPattern.test(candidate)) {
      console.log("🔧 EXTRACT UUID - Found valid UUID:", candidate, "from position", i);
      return candidate;
    }
  }

  if (compositeId.includes("_session_")) {
    const beforeSession = compositeId.split("_session_")[0];
    if (uuidPattern.test(beforeSession)) {
      console.log("🔧 EXTRACT UUID - Extracted before _session_:", beforeSession);
      return beforeSession;
    }
  }

  if (compositeId.includes("_")) {
    const firstPart = compositeId.split("_")[0];
    if (uuidPattern.test(firstPart)) {
      console.log("🔧 EXTRACT UUID - Extracted first part:", firstPart);
      return firstPart;
    }
  }

  console.error("🔧 EXTRACT UUID - No valid UUID found in:", compositeId);
  throw new Error(`Impossibile estrarre UUID valido da: ${compositeId}`);
};

export const isValidUUID = (uuid: string): boolean => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(uuid);
};

export const debugTimesheetId = (id: string) => {
  console.log("🔍 DEBUG ID:", {
    original: id,
    isValidUUID: isValidUUID(id),
    containsSession: id.includes("_session_"),
    containsUnderscore: id.includes("_"),
    containsSessionDash: id.includes("-session-"),
    parts: id.split(/[_-]/),
    extractedId: extractRealTimesheetId(id),
  });
};

export const verifyTimesheetIntegrity = async (timesheetId: string) => {
  const realId = extractRealTimesheetId(timesheetId);

  const { data: timesheet, error } = await supabase
    .from("timesheets")
    .select("id, user_id, start_time, end_time")
    .eq("id", realId)
    .single();

  if (error) {
    console.error("🔧 INTEGRITY CHECK - Timesheet not found:", error);
    return { valid: false, error: "Timesheet non trovato" };
  }

  const { data: sessions } = await supabase
    .from("timesheet_sessions")
    .select("id, session_order")
    .eq("timesheet_id", realId);

  console.log("🔧 INTEGRITY CHECK - Results:", {
    timesheetId: realId,
    exists: !!timesheet,
    sessionsCount: sessions?.length || 0,
  });

  return {
    valid: true,
    timesheet,
    sessions: sessions || [],
    sessionCount: sessions?.length || 0,
  };
};

// Espande un timesheet con più sessioni in un array di sessioni "virtuali"
export const processTimesheetSessions = (
  timesheet: TimesheetWithProfile,
): ExtendedTimesheetWithProfile[] => {
  console.log("🔍 PROCESS SESSIONS INPUT:", {
    timesheet_id: timesheet.id,
    user: timesheet.profiles?.first_name,
    sessions_count: timesheet.timesheet_sessions?.length,
    raw_sessions: timesheet.timesheet_sessions,
  });

  const sessions: ExtendedTimesheetWithProfile[] = [];

  if (timesheet.timesheet_sessions && timesheet.timesheet_sessions.length > 0) {
    timesheet.timesheet_sessions.forEach((session, index) => {
      if (session.start_time) {
        const sessionTimesheet: ExtendedTimesheetWithProfile = {
          ...timesheet,
          id: `${timesheet.id}_session_${session.id}_${index}`,
          start_time: session.start_time,
          end_time: session.end_time,
          session_hours: session.end_time
            ? (new Date(session.end_time).getTime() -
                new Date(session.start_time).getTime()) /
              (1000 * 60 * 60)
            : 0,
          session_type: session.session_type,
          session_notes: session.notes,
          session_order: session.session_order,
          is_session: true,
          original_timesheet_id: timesheet.id,
        };

        sessions.push(sessionTimesheet);
      }
    });
  } else if (timesheet.start_time) {
    sessions.push({
      ...timesheet,
      is_session: false,
      session_hours: timesheet.total_hours || 0,
    });
  }

  return sessions;
};
