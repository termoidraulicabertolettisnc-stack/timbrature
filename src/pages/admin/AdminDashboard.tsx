import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, FolderKanban, Calendar, TrendingUp, AlertCircle, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfMonth, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import PayrollDashboard from "@/components/PayrollDashboard";
import BusinessTripsDashboard from "@/components/BusinessTripsDashboard";

interface DashboardStats {
  active_employees: number;
  hours_today: number;
  employees_working_today: number;
  missing_timesheets_yesterday: number;
  monthly_completion: number;
}

interface TopOvertimeEmployee {
  first_name: string;
  last_name: string;
  overtime_hours: number;
  days_worked: number;
  threshold: number;
  percentage: number;
  alert_level: 'ok' | 'warning' | 'danger';
}

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Dashboard Amministratore</h2>
        <p className="text-muted-foreground">
          Panoramica generale del sistema TimeTracker
        </p>
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
  const [stats, setStats] = useState<DashboardStats>({
    active_employees: 0,
    hours_today: 0,
    employees_working_today: 0,
    missing_timesheets_yesterday: 0,
    monthly_completion: 0
  });
  
  const [topOvertime, setTopOvertime] = useState<TopOvertimeEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1. Dipendenti attivi
      const { count: activeCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      
      // 2. Ore lavorate oggi
      const { data: todayData } = await supabase
        .from('timesheets')
        .select('total_hours, user_id')
        .eq('date', format(new Date(), 'yyyy-MM-dd'));
      
      const hoursToday = todayData?.reduce((sum, t) => sum + (t.total_hours || 0), 0) || 0;
      const employeesToday = new Set(todayData?.map(t => t.user_id) || []).size;
      
      // 3. Timesheets mancanti ieri
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const { data: activeProfiles } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('is_active', true);
      
      const { data: yesterdayTimesheets } = await supabase
        .from('timesheets')
        .select('user_id')
        .eq('date', yesterday);
      
      const workersYesterday = new Set(yesterdayTimesheets?.map(t => t.user_id) || []);
      const missingCount = (activeProfiles || []).filter(
        p => !workersYesterday.has(p.user_id)
      ).length;
      
      // 4. Consolidato mensile
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Conta giorni lavorativi (escludi weekend)
      let workingDays = 0;
      let currentDay = new Date(monthStart);
      while (currentDay <= new Date()) {
        const dayOfWeek = currentDay.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workingDays++;
        currentDay = addDays(currentDay, 1);
      }
      
      const { data: monthTimesheets } = await supabase
        .from('timesheets')
        .select('date')
        .gte('date', monthStart)
        .lte('date', today);
      
      const uniqueDays = new Set(monthTimesheets?.map(t => t.date) || []).size;
      const completion = workingDays > 0 ? Math.round((uniqueDays / workingDays) * 100) : 0;
      
      // 5. Top 3 straordinari
      const { data: overtimeTimesheets } = await supabase
        .from('timesheets')
        .select('user_id, overtime_hours, profiles!timesheets_user_id_fkey(first_name, last_name)')
        .gte('date', monthStart)
        .lte('date', today)
        .not('overtime_hours', 'is', null)
        .gt('overtime_hours', 0);
      
      // Aggrega per dipendente
      const overtimeByEmployee = new Map<string, { 
        first_name: string, 
        last_name: string, 
        overtime_hours: number, 
        days_worked: number 
      }>();
      
      overtimeTimesheets?.forEach(ts => {
        const key = ts.user_id;
        const existing = overtimeByEmployee.get(key);
        if (existing) {
          existing.overtime_hours += ts.overtime_hours;
          existing.days_worked += 1;
        } else {
          overtimeByEmployee.set(key, {
            first_name: ts.profiles.first_name,
            last_name: ts.profiles.last_name,
            overtime_hours: ts.overtime_hours,
            days_worked: 1
          });
        }
      });
      
      // Calcola top 3
      const topOvertimeList: TopOvertimeEmployee[] = Array.from(overtimeByEmployee.values())
        .map(emp => {
          const threshold = emp.days_worked * 1; // 1h per giorno
          const percentage = threshold > 0 ? Math.round((emp.overtime_hours / threshold) * 100) : 0;
          let alert_level: 'ok' | 'warning' | 'danger' = 'ok';
          if (percentage > 100) alert_level = 'danger';
          else if (percentage > 80) alert_level = 'warning';
          
          return {
            ...emp,
            overtime_hours: Math.round(emp.overtime_hours * 10) / 10,
            threshold,
            percentage,
            alert_level
          };
        })
        .sort((a, b) => b.overtime_hours - a.overtime_hours)
        .slice(0, 3);
      
      setStats({
        active_employees: activeCount || 0,
        hours_today: Math.round(hoursToday * 10) / 10,
        employees_working_today: employeesToday,
        missing_timesheets_yesterday: missingCount,
        monthly_completion: completion
      });
      
      setTopOvertime(topOvertimeList);
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAlertBadge = (level: string) => {
    switch(level) {
      case 'danger':
        return { variant: 'destructive' as const, icon: '🔴', text: 'Oltre soglia' };
      case 'warning':
        return { variant: 'secondary' as const, icon: '🟡', text: 'Vicino soglia' };
      default:
        return { variant: 'default' as const, icon: '🟢', text: 'OK' };
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Dipendenti Attivi */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : stats.active_employees}
            </div>
            <p className="text-xs text-muted-foreground">
              Totale dipendenti attivi
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Ore Lavorate Oggi */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lavorate Oggi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : `${stats.hours_today}h`}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.employees_working_today} dipendenti al lavoro
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Timesheets Mancanti */}
        <Card className={stats.missing_timesheets_yesterday > 0 ? 'border-orange-200' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timesheets Mancanti</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : stats.missing_timesheets_yesterday}
            </div>
            <p className="text-xs text-muted-foreground">
              Non registrati ieri
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Consolidato Mensile */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidato Mensile</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : `${stats.monthly_completion}%`}
            </div>
            <p className="text-xs text-muted-foreground">
              Completamento mese corrente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card Grande: Top 3 Straordinari */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🏆 Top Straordinari Mese Corrente
          </CardTitle>
          <CardDescription>
            Soglia consigliata: 1h straordinari per giorno lavorativo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-4 text-muted-foreground">Caricamento...</p>
          ) : topOvertime.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">
              Nessun straordinario registrato questo mese
            </p>
          ) : (
            <div className="space-y-4">
              {topOvertime.map((employee, index) => {
                const alert = getAlertBadge(employee.alert_level);
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {index + 1}. {employee.first_name} {employee.last_name}
                        </span>
                        <Badge variant={alert.variant}>
                          {alert.icon} {alert.text}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {employee.overtime_hours}h / {employee.threshold}h 
                        {employee.percentage > 100 && (
                          <span className="text-red-600 font-medium ml-1">
                            +{employee.percentage - 100}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Progress 
                        value={Math.min(employee.percentage, 100)} 
                        className={
                          employee.alert_level === 'danger' ? '[&>div]:bg-destructive' :
                          employee.alert_level === 'warning' ? '[&>div]:bg-orange-500' :
                          '[&>div]:bg-primary'
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {employee.days_worked} giorni lavorati questo mese
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Attività Recenti
            </CardTitle>
            <CardDescription>
              Ultime modifiche e timbrature
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Mario Rossi</p>
                  <p className="text-xs text-muted-foreground">Timbratura entrata - 08:30</p>
                </div>
                <span className="text-xs text-muted-foreground">2 min fa</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Luigi Verdi</p>
                  <p className="text-xs text-muted-foreground">Modifica timesheet - Ieri</p>
                </div>
                <span className="text-xs text-muted-foreground">1 ora fa</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Anna Bianchi</p>
                  <p className="text-xs text-muted-foreground">Timbratura uscita - 17:30</p>
                </div>
                <span className="text-xs text-muted-foreground">3 ore fa</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Avvisi e Notifiche
            </CardTitle>
            <CardDescription>
              Situazioni che richiedono attenzione
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-destructive rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium">3 timesheets mancanti</p>
                  <p className="text-xs text-muted-foreground">Dipendenti senza registrazioni ieri</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-yellow-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Straordinari elevati</p>
                  <p className="text-xs text-muted-foreground">Marco Neri: 15 ore extra questa settimana</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-2 w-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium">Consolidato in scadenza</p>
                  <p className="text-xs text-muted-foreground">Completare entro il 5 del mese</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}