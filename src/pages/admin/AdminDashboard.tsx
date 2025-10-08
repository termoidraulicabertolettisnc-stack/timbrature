import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, FolderKanban, Calendar } from "lucide-react";
import PayrollDashboard from "@/components/PayrollDashboard";
import BusinessTripsDashboard from "@/components/BusinessTripsDashboard";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, addDays } from "date-fns";

// ============================================
// INTERFACCE
// ============================================

interface DashboardStats {
  active_employees: number;
  hours_today: number;
  employees_working_today: number;
  missing_timesheets_yesterday: number;
  monthly_completion: number;
}

interface OvertimeEmployee {
  first_name: string;
  last_name: string;
  last_30d_hours: number;
  ytd_hours: number;
  ytd_percentage: number;
  rolling_12m_hours: number;
  rolling_12m_percentage: number;
  alert_level: string;
  alert_reason: string;
}

// ============================================
// COMPONENTE PRINCIPALE
// ============================================

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Dashboard Amministratore</h2>
        <p className="text-muted-foreground">Panoramica generale del sistema TimeTracker</p>
      </div>

      <Tabs defaultValue="overview" className="w-full flex flex-col gap-4">
        <TabsList className="flex h-fit w-fit bg-muted/50 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-background">
            <Users className="h-4 w-4" />
            Panoramica
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex items-center gap-2 data-[state=active]:bg-background">
            <Clock className="h-4 w-4" />
            Vista Buste Paga
          </TabsTrigger>
          <TabsTrigger value="business-trips" className="flex items-center gap-2 data-[state=active]:bg-background">
            <FolderKanban className="h-4 w-4" />
            Trasferte
          </TabsTrigger>
        </TabsList>
        <div className="w-full">
          <TabsContent value="overview" className="space-y-6 mt-0">
            <OverviewDashboard />
          </TabsContent>

          <TabsContent value="payroll" className="mt-0">
            <PayrollDashboard />
          </TabsContent>

          <TabsContent value="business-trips" className="mt-0">
            <BusinessTripsDashboard />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ============================================
// COMPONENTE OVERVIEW DASHBOARD
// ============================================

function OverviewDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    active_employees: 0,
    hours_today: 0,
    employees_working_today: 0,
    missing_timesheets_yesterday: 0,
    monthly_completion: 0,
  });
  const [topOvertime, setTopOvertime] = useState<OvertimeEmployee[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Dipendenti attivi
      const { count: activeCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // 2. Ore lavorate oggi
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: todayTimesheets } = await supabase
        .from("timesheets")
        .select("total_hours, user_id")
        .eq("date", today);

      const hoursToday = todayTimesheets?.reduce((sum, t) => sum + (t.total_hours || 0), 0) || 0;
      const employeesToday = new Set(todayTimesheets?.map((t) => t.user_id) || []).size;

      // 3. Timesheets mancanti ieri
      const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
      const dayOfWeek = new Date(yesterday).getDay();

      let missingCount = 0;
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const { data: activeEmployees } = await supabase.from("profiles").select("user_id").eq("is_active", true);

        const { data: yesterdayTimesheets } = await supabase.from("timesheets").select("user_id").eq("date", yesterday);

        const employeesWithTimesheets = new Set(yesterdayTimesheets?.map((t) => t.user_id) || []);
        missingCount = (activeEmployees?.length || 0) - employeesWithTimesheets.size;
      }

      // 4. Consolidato mensile
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

      let workingDays = 0;
      let currentDay = new Date(monthStart);
      while (currentDay <= new Date()) {
        const dayOfWeek = currentDay.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
        currentDay = addDays(currentDay, 1);
      }

      const { data: monthTimesheets } = await supabase
        .from("timesheets")
        .select("date")
        .gte("date", monthStart)
        .lte("date", today);

      const uniqueDays = new Set(monthTimesheets?.map((t) => t.date) || []).size;
      const completion = workingDays > 0 ? Math.round((uniqueDays / workingDays) * 100) : 0;

      // 5. Top straordinari (Vista Ibrida)
      const { data: overtimeData } = await supabase.rpc("get_overtime_hybrid_view");

      setStats({
        active_employees: activeCount || 0,
        hours_today: Math.round(hoursToday * 10) / 10,
        employees_working_today: employeesToday,
        missing_timesheets_yesterday: missingCount,
        monthly_completion: completion,
      });

      setTopOvertime(overtimeData || []);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertBadge = (level: string) => {
    switch (level) {
      case "critical":
        return { variant: "destructive" as const, text: "CRITICO" };
      case "danger":
        return { variant: "destructive" as const, text: "PERICOLO" };
      case "warning":
        return { variant: "default" as const, text: "ATTENZIONE" };
      case "attention":
        return { variant: "secondary" as const, text: "MONITORARE" };
      default:
        return { variant: "outline" as const, text: "OK" };
    }
  };

  return (
    <div className="space-y-4">
      {/* 4 Card KPI */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : stats.active_employees}</div>
            <p className="text-xs text-muted-foreground">Totale dipendenti attivi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lavorate Oggi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : `${stats.hours_today}h`}</div>
            <p className="text-xs text-muted-foreground">Da {stats.employees_working_today} dipendenti</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timesheets Mancanti</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : stats.missing_timesheets_yesterday}</div>
            <p className="text-xs text-muted-foreground">
              {stats.missing_timesheets_yesterday > 0 ? "⚠️ Compilare giorno precedente" : "✅ Tutto OK"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidato Mensile</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : `${stats.monthly_completion}%`}</div>
            <p className="text-xs text-muted-foreground">Giorni lavorativi completi</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Straordinari Ibrida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">📊 Top 3 Dipendenti - Straordinari (Vista Ibrida)</CardTitle>
          <CardDescription>
            Limite normativo: 250 ore/anno (D.Lgs. 66/2003) - Anno solare: 1 gen - 31 dic
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : topOvertime.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nessun dato straordinari disponibile</div>
          ) : (
            <div className="space-y-4">
              {topOvertime.slice(0, 3).map((employee, index) => (
                <Card key={index} className="border-l-4 border-l-primary/50">
                  <CardContent className="pt-6">
                    {/* Nome dipendente e Alert */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {employee.first_name} {employee.last_name}
                        </h3>
                        <Badge {...getAlertBadge(employee.alert_level)} className="mt-1">
                          {getAlertBadge(employee.alert_level).text}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">{employee.ytd_hours.toFixed(1)}h</div>
                        <div className="text-sm text-muted-foreground">Anno 2025</div>
                      </div>
                    </div>

                    {/* Progress Bar Anno Solare */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium">Progresso Anno Solare</span>
                        <span className="text-muted-foreground">{employee.ytd_percentage}%</span>
                      </div>
                      <Progress value={employee.ytd_percentage} className="h-2" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>0h</span>
                        <span>250h (limite legale)</span>
                      </div>
                    </div>

                    {/* Tre colonne: Ultimo Mese | Anno Solare | Ultimi 12 Mesi */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      {/* Colonna 1: Ultimo Mese */}
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Ultimo Mese</div>
                        <div className="text-xl font-bold">{employee.last_30d_hours.toFixed(1)}h</div>
                        <div className="text-xs text-muted-foreground mt-1">Ultimi 30 giorni</div>
                      </div>

                      {/* Colonna 2: Anno Solare (Normativo) */}
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border-2 border-green-200 dark:border-green-800">
                        <div className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">
                          Anno 2025 (Normativo)
                        </div>
                        <div className="text-xl font-bold text-green-700 dark:text-green-400">
                          {employee.ytd_hours.toFixed(1)}h / 250h
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                          {employee.ytd_percentage}% • {(250 - employee.ytd_hours).toFixed(1)}h disponibili
                        </div>
                      </div>

                      {/* Colonna 3: Ultimi 12 Mesi (Trend) */}
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Ultimi 12 Mesi (Trend)</div>
                        <div className="text-xl font-bold">{employee.rolling_12m_hours.toFixed(1)}h</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {employee.rolling_12m_percentage}% del limite
                        </div>
                      </div>
                    </div>

                    {/* Alert Reason */}
                    {employee.alert_level !== "ok" && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-950/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ {employee.alert_reason}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
