import { useState, useEffect, useMemo, useCallback } from "react";
import { useTimesheets } from "@/hooks/useTimesheets";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TimesheetWithProfile } from "@/types/timesheet";
import { BenefitsService } from "@/services/BenefitsService";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { WeeklyTimelineView } from "@/components/WeeklyTimelineView";
import {
  AdminTimesheetsView,
  getSavedTimesheetViewState,
  persistTimesheetViewState,
} from "@/utils/timesheetViewState";
import {
  extractRealTimesheetId,
  processTimesheetSessions,
} from "@/utils/timesheetIdUtils";
import { useTimesheetNavigation } from "@/hooks/useTimesheetNavigation";
import { TimesheetActionsBar } from "@/components/admin-timesheets/TimesheetActionsBar";
import { TimesheetFiltersBar } from "@/components/admin-timesheets/TimesheetFiltersBar";
import {
  TimesheetDialogs,
  DayEditData,
} from "@/components/admin-timesheets/TimesheetDialogs";
import { DailySummaryView } from "@/components/admin-timesheets/DailySummaryView";
import type { EmployeeSummary } from "@/components/admin-timesheets/HoursDisplays";

export { HoursDisplayFixed } from "@/components/admin-timesheets/HoursDisplays";

export default function AdminTimesheets() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Dati
  const [absences, setAbsences] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Vista e filtri
  const initialState = useMemo(() => getSavedTimesheetViewState(), []);
  const [activeView, setActiveView] = useState<AdminTimesheetsView>(initialState.activeView);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>(["all"]);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>(initialState.dateFilter);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Persistenza vista
  useEffect(() => {
    persistTimesheetViewState({ activeView, dateFilter });
  }, [activeView, dateFilter]);

  // Timesheet via React Query
  const {
    timesheets,
    isLoading: loading,
    invalidate: invalidateTimesheets,
  } = useTimesheets({
    dateFilter,
    activeView,
    selectedEmployee: selectedEmployees.includes("all") ? "all" : selectedEmployees[0] || "all",
    selectedProject,
  });

  // Navigazione date
  const { navigateToToday, navigatePrevious, navigateNext } = useTimesheetNavigation({
    activeView,
    dateFilter,
    setDateFilter,
  });

  // Stati dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [massAbsenceDialogOpen, setMassAbsenceDialogOpen] = useState(false);
  const [massTimesheetDialogOpen, setMassTimesheetDialogOpen] = useState(false);
  const [massDeleteDialogOpen, setMassDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [dayEditDialogOpen, setDayEditDialogOpen] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState<TimesheetWithProfile | null>(null);
  const [selectedTimesheetDate, setSelectedTimesheetDate] = useState<string>("");
  const [preSelectedEmployeeId, setPreSelectedEmployeeId] = useState<string>("");
  const [dayEditData, setDayEditData] = useState<DayEditData | null>(null);

  const selectedDialogDate = useMemo(
    () => parseISO(selectedTimesheetDate || dateFilter),
    [selectedTimesheetDate, dateFilter],
  );

  // Impostazioni
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [employeeSettings, setEmployeeSettings] = useState<{ [key: string]: any }>({});

  // Range date corrente in base alla vista
  const getCurrentDateRange = useCallback(() => {
    const baseDate = parseISO(dateFilter);
    let startDate: Date;
    let endDate: Date;
    switch (activeView) {
      case "weekly":
        startDate = startOfWeek(baseDate, { weekStartsOn: 1 });
        endDate = endOfWeek(baseDate, { weekStartsOn: 1 });
        break;
      case "monthly":
        startDate = startOfMonth(baseDate);
        endDate = endOfMonth(baseDate);
        break;
      default:
        startDate = baseDate;
        endDate = baseDate;
    }
    return { startDate, endDate };
  }, [dateFilter, activeView]);

  // Loaders
  const loadEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("last_name")
        .order("first_name");
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error("Error loading employees:", error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dipendenti",
        variant: "destructive",
      });
    }
  }, [toast]);

  const loadProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("projects").select("*").order("name");
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error("Error loading projects:", error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei progetti",
        variant: "destructive",
      });
    }
  }, [toast]);

  const loadSettings = useCallback(async () => {
    try {
      const { data: companyData, error: companyError } = await supabase
        .from("company_settings")
        .select("*, companies!company_settings_company_id_fkey(city)")
        .limit(1)
        .single();

      if (!companyError && companyData) {
        setCompanySettings({
          ...companyData,
          city: companyData.companies?.city || null,
        });
      }

      const { data: employeeData, error: employeeError } = await supabase
        .from("employee_settings")
        .select("*");

      if (!employeeError && employeeData) {
        const settingsMap = employeeData.reduce(
          (acc, setting) => {
            acc[setting.user_id] = setting;
            return acc;
          },
          {} as { [key: string]: any },
        );
        setEmployeeSettings(settingsMap);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  }, []);

  const loadAbsences = useCallback(
    async (startDate: Date, endDate: Date) => {
      try {
        let absenceQuery = supabase
          .from("employee_absences")
          .select("*")
          .gte("date", format(startDate, "yyyy-MM-dd"))
          .lte("date", format(endDate, "yyyy-MM-dd"))
          .order("date", { ascending: false });

        const effectiveEmployee = selectedEmployees.includes("all")
          ? "all"
          : selectedEmployees.length === 1
            ? selectedEmployees[0]
            : null;
        if (effectiveEmployee && effectiveEmployee !== "all") {
          absenceQuery = absenceQuery.eq("user_id", effectiveEmployee);
        } else if (!selectedEmployees.includes("all") && selectedEmployees.length > 1) {
          absenceQuery = absenceQuery.in("user_id", selectedEmployees);
        }

        const { data: absenceData, error: absenceError } = await absenceQuery;
        if (absenceError) throw absenceError;

        if (!absenceData || absenceData.length === 0) {
          setAbsences([]);
          return;
        }

        const userIds = [...new Set(absenceData.map((a) => a.user_id))];
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", userIds);
        if (profilesError) throw profilesError;

        const absencesWithProfiles = absenceData.map((absence) => ({
          ...absence,
          profiles: profilesData?.find((p) => p.user_id === absence.user_id) || null,
        }));

        setAbsences(absencesWithProfiles);
      } catch (error) {
        console.error("❌ Errore nel caricamento assenze:", error);
        toast({
          title: "Errore",
          description: "Errore nel caricamento delle assenze",
          variant: "destructive",
        });
      }
    },
    [selectedEmployees, toast],
  );

  const refreshAbsences = useCallback(async () => {
    const { startDate, endDate } = getCurrentDateRange();
    await loadAbsences(startDate, endDate);
  }, [getCurrentDateRange, loadAbsences]);

  // Carica dati iniziali
  useEffect(() => {
    if (user) {
      loadEmployees();
      loadProjects();
      loadSettings();
    }
  }, [user, loadEmployees, loadProjects, loadSettings]);

  // Ricarica assenze al cambio filtri
  useEffect(() => {
    if (user) {
      const { startDate, endDate } = getCurrentDateRange();
      loadAbsences(startDate, endDate);
    }
  }, [user, selectedEmployees, selectedProject, dateFilter, activeView, getCurrentDateRange, loadAbsences]);

  // Realtime: timesheets
  useEffect(() => {
    const channel = supabase
      .channel("admin-timesheets-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "timesheets" },
        () => {
          console.log("🔄 Cache invalidation triggered by realtime");
          invalidateTimesheets();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [invalidateTimesheets]);

  // Realtime: assenze
  useEffect(() => {
    const channel = supabase
      .channel("admin-absences-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_absences" },
        () => {
          console.log("🔄 Absences refresh triggered by realtime");
          refreshAbsences();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshAbsences]);

  // Refresh periodico per ore in tempo reale
  const [, setRealtimeUpdateTrigger] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setRealtimeUpdateTrigger((prev) => prev + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Eliminazione unificata
  const handleDeleteTimesheetUnified = useCallback(
    async (
      timesheetId: string,
      deleteType: "timesheet" | "session" = "timesheet",
      sessionId?: string,
    ) => {
      const confirmMessage =
        deleteType === "session"
          ? "Sei sicuro di voler eliminare questa sessione?"
          : "Sei sicuro di voler eliminare questo timesheet con tutte le sessioni?";

      if (!confirm(`${confirmMessage} Questa azione non può essere annullata.`)) {
        return false;
      }

      try {
        const realId = extractRealTimesheetId(timesheetId);

        const {
          data: { user: currentUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !currentUser) throw new Error("Utente non autenticato");

        const { data: timesheet, error: checkError } = await supabase
          .from("timesheets")
          .select("id, user_id")
          .eq("id", realId)
          .single();

        if (checkError) {
          if (checkError.code === "PGRST116") throw new Error("Timesheet non trovato");
          throw new Error(`Errore verifica timesheet: ${checkError.message}`);
        }
        if (!timesheet) throw new Error("Timesheet non trovato");

        if (deleteType === "session" && sessionId) {
          const { error: sessionError } = await supabase
            .from("timesheet_sessions")
            .delete()
            .eq("id", sessionId)
            .eq("timesheet_id", realId);
          if (sessionError)
            throw new Error(`Errore eliminazione sessione: ${sessionError.message}`);
        } else {
          const { error: sessionsError } = await supabase
            .from("timesheet_sessions")
            .delete()
            .eq("timesheet_id", realId);
          if (sessionsError)
            throw new Error(`Errore eliminazione sessioni: ${sessionsError.message}`);

          const { error: timesheetError } = await supabase
            .from("timesheets")
            .delete()
            .eq("id", realId);
          if (timesheetError)
            throw new Error(`Errore eliminazione timesheet: ${timesheetError.message}`);
        }

        toast({
          title: "Successo",
          description:
            deleteType === "session"
              ? "Sessione eliminata con successo"
              : "Timesheet eliminato con successo",
        });

        invalidateTimesheets();
        return true;
      } catch (error: any) {
        console.error("🔧 UNIFIED DELETE - Error:", error);
        toast({
          title: "Errore",
          description: error.message || "Errore durante l'eliminazione",
          variant: "destructive",
        });
        return false;
      }
    },
    [toast, invalidateTimesheets],
  );

  // Helpers di aggiunta da day cell
  const handleAddTimesheet = (date: string, userId: string) => {
    setSelectedTimesheetDate(date);
    setPreSelectedEmployeeId(userId);
    setInsertDialogOpen(true);
  };

  const handleAddAbsence = (date: string, userId: string) => {
    setSelectedTimesheetDate(date);
    setPreSelectedEmployeeId(userId);
    setAbsenceDialogOpen(true);
  };

  const handleEditDay = (
    date: string,
    employee: any,
    timesheet: TimesheetWithProfile | null,
    sessions: any[],
  ) => {
    setDayEditData({ date, employee, timesheet, sessions });
    setDayEditDialogOpen(true);
  };

  // Filtro per search
  const getEmployeeName = (timesheet: TimesheetWithProfile) =>
    timesheet.profiles
      ? `${timesheet.profiles.first_name} ${timesheet.profiles.last_name}`
      : "Dipendente sconosciuto";

  const filteredTimesheets = useMemo(
    () =>
      timesheets.filter((t) => {
        if (!searchTerm) return true;
        const employeeName = getEmployeeName(t).toLowerCase();
        const projectName = t.projects?.name?.toLowerCase() || "";
        const term = searchTerm.toLowerCase();
        return employeeName.includes(term) || projectName.includes(term);
      }),
    [timesheets, searchTerm],
  );

  // Aggregazione per dipendente
  const aggregatedEmployees = useMemo<EmployeeSummary[]>(() => {
    const employeeMap = new Map<string, EmployeeSummary>();

    employees.forEach((emp) => {
      if (!employeeMap.has(emp.user_id)) {
        employeeMap.set(emp.user_id, {
          user_id: emp.user_id,
          first_name: emp.first_name || "",
          last_name: emp.last_name || "",
          email: emp.email || "",
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          regular_hours: 0,
          meal_vouchers: 0,
          timesheets: [],
          total_sessions: 0,
        });
      }
    });

    filteredTimesheets.forEach((timesheet) => {
      const userId = timesheet.user_id;
      if (!employeeMap.has(userId)) {
        employeeMap.set(userId, {
          user_id: userId,
          first_name: timesheet.profiles?.first_name || "",
          last_name: timesheet.profiles?.last_name || "",
          email: timesheet.profiles?.email || "",
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          regular_hours: 0,
          meal_vouchers: 0,
          timesheets: [],
          total_sessions: 0,
        });
      }

      const employee = employeeMap.get(userId)!;
      const sessionsData = processTimesheetSessions(timesheet);
      employee.timesheets.push(...sessionsData);

      employee.total_hours += timesheet.total_hours || 0;
      employee.overtime_hours += timesheet.overtime_hours || 0;
      employee.night_hours += timesheet.night_hours || 0;
      employee.regular_hours +=
        (timesheet.total_hours || 0) - (timesheet.overtime_hours || 0);

      if (timesheet.meal_voucher_earned) {
        employee.meal_vouchers += 1;
      }
    });

    employeeMap.forEach((employee) => {
      employee.regular_hours = Math.max(0, employee.total_hours - employee.overtime_hours);
    });

    return Array.from(employeeMap.values());
  }, [filteredTimesheets, employees]);

  // Utilizzato in futuro / mantenuto per compatibilità con la logica buoni pasto
  void BenefitsService;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-center">Caricamento...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <TimesheetActionsBar
        onNewTimesheet={() => {
          setSelectedTimesheetDate(dateFilter);
          setPreSelectedEmployeeId("");
          setInsertDialogOpen(true);
        }}
        onNewAbsence={() => {
          setSelectedTimesheetDate(dateFilter);
          setPreSelectedEmployeeId("");
          setAbsenceDialogOpen(true);
        }}
        onMassTimesheet={() => setMassTimesheetDialogOpen(true)}
        onMassAbsence={() => setMassAbsenceDialogOpen(true)}
        onMassDelete={() => setMassDeleteDialogOpen(true)}
        onImport={() => setImportDialogOpen(true)}
      />

      <TimesheetFiltersBar
        employees={employees}
        selectedEmployees={selectedEmployees}
        setSelectedEmployees={setSelectedEmployees}
        projects={projects}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isCalendarOpen={isCalendarOpen}
        setIsCalendarOpen={setIsCalendarOpen}
      />

      <Tabs
        value={activeView}
        onValueChange={(value) => setActiveView(value as AdminTimesheetsView)}
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="daily">Vista Giornaliera</TabsTrigger>
          <TabsTrigger value="weekly">Vista Settimanale</TabsTrigger>
          <TabsTrigger value="monthly">Vista Mensile</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="mt-6">
          <DailySummaryView
            timesheets={filteredTimesheets}
            absences={absences}
            dateFilter={dateFilter}
            aggregateTimesheetsByEmployee={() => aggregatedEmployees}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditDay={handleEditDay}
            onDeleteTimesheet={handleDeleteTimesheetUnified}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
          />
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <WeeklyTimelineView
            timesheets={filteredTimesheets}
            absences={absences}
            dateFilter={dateFilter}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditTimesheet={(timesheet) => {
              setEditingTimesheet(timesheet);
              setEditDialogOpen(true);
            }}
            onDeleteTimesheet={handleDeleteTimesheetUnified}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
            onEditDay={handleEditDay}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          <MonthlyCalendarView
            timesheets={filteredTimesheets}
            absences={absences}
            dateFilter={dateFilter}
            employeeSettings={employeeSettings}
            companySettings={companySettings}
            onEditTimesheet={(timesheet) => {
              setEditingTimesheet(timesheet);
              setEditDialogOpen(true);
            }}
            onDeleteTimesheet={handleDeleteTimesheetUnified}
            onAddTimesheet={handleAddTimesheet}
            onAddAbsence={handleAddAbsence}
            onNavigatePrevious={navigatePrevious}
            onNavigateNext={navigateNext}
            onNavigateToday={navigateToToday}
            onEditDay={handleEditDay}
          />
        </TabsContent>
      </Tabs>

      <TimesheetDialogs
        editDialogOpen={editDialogOpen}
        setEditDialogOpen={setEditDialogOpen}
        editingTimesheet={editingTimesheet}
        setEditingTimesheet={setEditingTimesheet}
        insertDialogOpen={insertDialogOpen}
        setInsertDialogOpen={setInsertDialogOpen}
        selectedDialogDate={selectedDialogDate}
        preSelectedEmployeeId={preSelectedEmployeeId}
        setPreSelectedEmployeeId={setPreSelectedEmployeeId}
        setSelectedTimesheetDate={setSelectedTimesheetDate}
        absenceDialogOpen={absenceDialogOpen}
        setAbsenceDialogOpen={setAbsenceDialogOpen}
        massAbsenceDialogOpen={massAbsenceDialogOpen}
        setMassAbsenceDialogOpen={setMassAbsenceDialogOpen}
        massTimesheetDialogOpen={massTimesheetDialogOpen}
        setMassTimesheetDialogOpen={setMassTimesheetDialogOpen}
        massDeleteDialogOpen={massDeleteDialogOpen}
        setMassDeleteDialogOpen={setMassDeleteDialogOpen}
        importDialogOpen={importDialogOpen}
        setImportDialogOpen={setImportDialogOpen}
        dayEditDialogOpen={dayEditDialogOpen}
        setDayEditDialogOpen={setDayEditDialogOpen}
        dayEditData={dayEditData}
        setDayEditData={setDayEditData}
        employeeSettings={employeeSettings}
        companySettings={companySettings}
        invalidateTimesheets={invalidateTimesheets}
        refreshAbsences={refreshAbsences}
      />
    </div>
  );
}
