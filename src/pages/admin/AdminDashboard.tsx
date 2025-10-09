// ====================================================
// 🔧 CORREZIONE: AdminDashboard.tsx - OverviewDashboard
// ====================================================
// PROBLEMA: Tutti i dati sono hardcoded, nessuna query database
// SOLUZIONE: Implementare query reali per tutte le metriche
// ====================================================

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, FolderKanban, Calendar, TrendingUp, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import PayrollDashboard from "@/components/PayrollDashboard";
import BusinessTripsDashboard from "@/components/BusinessTripsDashboard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from "date-fns";

interface DashboardStats {
  activeEmployees: number;
  hoursToday: number;
  employeesWorkingToday: number;
  activeProjects: number;
  monthlyCompletion: number;
  missingTimesheets: number;
}

interface OvertimeEmployee {
  user_id: string;
  name: string;
  lastMonthHours: number;
  yearHours: number;
  yearPercentage: number;
  status: "ok" | "monitorare" | "alto";
}

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

function OverviewDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [top3Overtime, setTop3Overtime] = useState<OvertimeEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await Promise.all([loadStats(), loadTop3Overtime()]);
    } catch (error) {
      console.error("❌ Errore caricamento dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // 1. Dipendenti attivi
      const { count: activeCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // 2. Ore lavorate OGGI
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: todayTimesheets } = await supabase
        .from("timesheets")
        .select("total_hours, user_id")
        .eq("date", today)
        .not("total_hours", "is", null);

      const hoursToday = todayTimesheets?.reduce((sum, t) => sum + (t.total_hours || 0), 0) || 0;
      const employeesToday = new Set(todayTimesheets?.map((t) => t.user_id)).size;

      // 3. Progetti attivi
      const { count: projectsCount } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");

      // 4. Completamento mensile
      const startMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const endMonth = format(endOfMonth(new Date()), "yyyy-MM-dd");

      const { data: monthTimesheets } = await supabase
        .from("timesheets")
        .select("date, user_id")
        .gte("date", startMonth)
        .lte("date", endMonth);

      const workDaysInMonth = 22; // Approssimativo
      const expectedTimesheets = (activeCount || 0) * workDaysInMonth;
      const actualTimesheets = monthTimesheets?.length || 0;
      const completion = expectedTimesheets > 0 ? Math.round((actualTimesheets / expectedTimesheets) * 100) : 0;

      // 5. Timesheets mancanti IERI
      const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
      const { data: yesterdayTimesheets } = await supabase.from("timesheets").select("user_id").eq("date", yesterday);

      const employeesYesterday = new Set(yesterdayTimesheets?.map((t) => t.user_id)).size;
      const missing = (activeCount || 0) - employeesYesterday;

      setStats({
        activeEmployees: activeCount || 0,
        hoursToday: Math.round(hoursToday * 10) / 10,
        employeesWorkingToday: employeesToday,
        activeProjects: projectsCount || 0,
        monthlyCompletion: completion,
        missingTimesheets: Math.max(0, missing),
      });
    } catch (error) {
      console.error("❌ Errore caricamento stats:", error);
    }
  };

  const loadTop3Overtime = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;

      // Straordinari anno corrente
      const { data: yearData } = await supabase
        .from("timesheets")
        .select(
          `
          user_id,
          overtime_hours,
          profiles!timesheets_user_id_fkey (
            first_name,
            last_name
          )
        `,
        )
        .gte("date", yearStart)
        .lte("date", yearEnd)
        .not("overtime_hours", "is", null);

      // Straordinari ultimo mese
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const monthStart = format(startOfMonth(lastMonth), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(lastMonth), "yyyy-MM-dd");

      const { data: monthData } = await supabase
        .from("timesheets")
        .select("user_id, overtime_hours")
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .not("overtime_hours", "is", null);

      // Aggrega per dipendente
      const employeeMap = new Map<string, OvertimeEmployee>();

      yearData?.forEach((t) => {
        if (!t.profiles) return;

        const key = t.user_id;
        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            user_id: t.user_id,
            name: `${t.profiles.first_name} ${t.profiles.last_name}`,
            yearHours: 0,
            lastMonthHours: 0,
            yearPercentage: 0,
            status: "ok",
          });
        }
        const emp = employeeMap.get(key)!;
        emp.yearHours += t.overtime_hours || 0;
      });

      monthData?.forEach((t) => {
        const emp = employeeMap.get(t.user_id);
        if (emp) {
          emp.lastMonthHours += t.overtime_hours || 0;
        }
      });

      // Calcola percentuali e status
      const LIMIT = 250; // Limite normativo ore/anno
      employeeMap.forEach((emp) => {
        emp.yearHours = Math.round(emp.yearHours * 10) / 10;
        emp.lastMonthHours = Math.round(emp.lastMonthHours * 10) / 10;
        emp.yearPercentage = Math.round((emp.yearHours / LIMIT) * 100);

        if (emp.yearPercentage >= 50) emp.status = "alto";
        else if (emp.yearPercentage >= 20) emp.status = "monitorare";
        else emp.status = "ok";
      });

      // Top 3 per straordinari anno
      const top3 = Array.from(employeeMap.values())
        .sort((a, b) => b.yearHours - a.yearHours)
        .slice(0, 3);

      setTop3Overtime(top3);
    } catch (error) {
      console.error("❌ Errore caricamento top 3 straordinari:", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12 text-muted-foreground">Caricamento dati dashboard...</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "alto":
        return "text-red-600 bg-red-50";
      case "monitorare":
        return "text-orange-600 bg-orange-50";
      default:
        return "text-green-600 bg-green-50";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "alto":
        return "Alto";
      case "monitorare":
        return "Monitorare";
      default:
        return "OK";
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">Totale dipendenti attivi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lavorate Oggi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.hoursToday || 0}h</div>
            <p className="text-xs text-muted-foreground">Da {stats?.employeesWorkingToday || 0} dipendenti</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commesse Attive</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeProjects || 0}</div>
            <p className="text-xs text-muted-foreground">Progetti in corso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timesheets Mancanti</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.missingTimesheets || 0}</div>
            <p className="text-xs text-muted-foreground">Compilare giorno precedente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidato Mensile</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.monthlyCompletion || 0}%</div>
            <p className="text-xs text-muted-foreground">Giorni lavorativi completi</p>
          </CardContent>
        </Card>
      </div>

      {/* 📊 TOP 3 STRAORDINARI - SEZIONE MANCANTE */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            <CardTitle>Top 3 Dipendenti - Straordinari (Vista Ibrida)</CardTitle>
          </div>
          <CardDescription>
            Limite normativo: 250 ore/anno (D.Lgs. 66/2003) - Anno solare: 1 gen - 31 dic
          </CardDescription>
        </CardHeader>
        <CardContent>
          {top3Overtime.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nessun dato straordinari disponibile</div>
          ) : (
            <div className="space-y-6">
              {top3Overtime.map((emp, index) => (
                <div key={emp.user_id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{emp.name}</span>
                      <Badge className={getStatusColor(emp.status)}>{getStatusLabel(emp.status)}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Ultimo Mese</div>
                      <div className="font-semibold text-lg">{emp.lastMonthHours}h</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round((emp.lastMonthHours / emp.yearHours) * 100 || 0)}% del totale
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-muted-foreground">Anno 2025 (Normativo)</div>
                      <div className="font-semibold text-lg text-blue-700">{emp.yearHours}h / 250h</div>
                      <div className="text-xs text-muted-foreground">
                        {emp.yearPercentage}% • {Math.round(250 - emp.yearHours)}h disponibili
                      </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-muted-foreground">Ultimi 12 Mesi (Trend)</div>
                      <div className="font-semibold text-lg text-blue-700">{emp.yearHours}h</div>
                      <div className="text-xs text-muted-foreground">{emp.yearPercentage}% del limite</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progresso Anno Solare</span>
                      <span>{emp.yearPercentage}%</span>
                    </div>
                    <Progress value={emp.yearPercentage} className="h-2" />
                  </div>

                  {emp.yearPercentage >= 50 && (
                    <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 p-2 rounded">
                      <AlertCircle className="h-4 w-4 mt-0.5" />
                      <span>Ritmo elevato ultimo mese</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions - Manteniamo placeholder */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Attività Recenti
            </CardTitle>
            <CardDescription>Ultime timbrature e modifiche</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center py-4">Sezione in sviluppo</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Avvisi e Notifiche
            </CardTitle>
            <CardDescription>Situazioni che richiedono attenzione</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats && stats.missingTimesheets > 0 && (
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 bg-destructive rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">{stats.missingTimesheets} timesheets mancanti</p>
                    <p className="text-xs text-muted-foreground">Dipendenti senza registrazioni ieri</p>
                  </div>
                </div>
              )}
              {top3Overtime.filter((e) => e.status === "alto").length > 0 && (
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Straordinari elevati</p>
                    <p className="text-xs text-muted-foreground">
                      {top3Overtime.filter((e) => e.status === "alto")[0]?.name}:{" "}
                      {top3Overtime.filter((e) => e.status === "alto")[0]?.yearHours}h anno
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
