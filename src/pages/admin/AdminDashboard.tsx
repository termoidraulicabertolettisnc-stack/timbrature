import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, FolderKanban, Calendar, TrendingUp, AlertCircle, AlertTriangle } from "lucide-react";
import PayrollDashboard from "@/components/PayrollDashboard";
import BusinessTripsDashboard from "@/components/BusinessTripsDashboard";
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, addDays, eachDayOfInterval, isWeekend } from 'date-fns';

// ============================================
// INTERFACCE TYPESCRIPT
// ============================================

interface DashboardStats {
  activeEmployees: number;
  hoursWorkedToday: number;
  activeEmployeesToday: number;
  missingTimesheetsYesterday: number;
  monthlyConsolidationPercentage: number;
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

// ============================================
// COMPONENTE PRINCIPALE
// ============================================

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

// ============================================
// DASHBOARD OVERVIEW (FUNZIONALE)
// ============================================

function OverviewDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    activeEmployees: 0,
    hoursWorkedToday: 0,
    activeEmployeesToday: 0,
    missingTimesheetsYesterday: 0,
    monthlyConsolidationPercentage: 0,
  });
  const [topOvertime, setTopOvertime] = useState<TopOvertimeEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // 1. Dipendenti Attivi
      const { data: activeProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('is_active', true);

      if (profilesError) throw profilesError;
      const activeEmployees = activeProfiles?.length || 0;

      // 2. Ore Lavorate Oggi + Dipendenti attivi oggi
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: todayTimesheets, error: todayError } = await supabase
        .from('timesheets')
        .select('total_hours, user_id')
        .eq('date', today);

      if (todayError) throw todayError;

      const hoursWorkedToday = todayTimesheets?.reduce((sum, t) => sum + (t.total_hours || 0), 0) || 0;
      const activeEmployeesToday = new Set(todayTimesheets?.map(t => t.user_id) || []).size;

      // 3. Timesheets Mancanti Ieri
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      const { data: yesterdayTimesheets, error: yesterdayError } = await supabase
        .from('timesheets')
        .select('user_id')
        .eq('date', yesterday);

      if (yesterdayError) throw yesterdayError;

      const timesheetsYesterday = new Set(yesterdayTimesheets?.map(t => t.user_id) || []);
      const missingTimesheetsYesterday = activeEmployees - timesheetsYesterday.size;

      // 4. Consolidato Mensile (% giorni compilati vs giorni lavorativi)
      const startOfCurrentMonth = startOfMonth(new Date());
      const daysInMonth = eachDayOfInterval({
        start: startOfCurrentMonth,
        end: new Date(),
      });

      // Conta solo giorni lavorativi (lunedì-venerdì)
      const workingDays = daysInMonth.filter(day => !isWeekend(day)).length;

      const { data: monthTimesheets, error: monthError } = await supabase
        .from('timesheets')
        .select('date, user_id')
        .gte('date', format(startOfCurrentMonth, 'yyyy-MM-dd'))
        .lte('date', today);

      if (monthError) throw monthError;

      // Conta giorni unici con almeno un timesheet
      const compiledDaysSet = new Set(monthTimesheets?.map(t => t.date) || []);
      const compiledDays = compiledDaysSet.size;

      const monthlyConsolidationPercentage = workingDays > 0 
        ? Math.round((compiledDays / workingDays) * 100) 
        : 0;

      // 5. Top 3 Straordinari (ultimi 30 giorni)
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const { data: overtimeTimesheets } = await supabase
        .from('timesheets')
        .select('user_id, overtime_hours, profiles!timesheets_user_id_fkey(first_name, last_name)')
        .gte('date', thirtyDaysAgo)
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

      setTopOvertime(topOvertimeList);

      // Aggiorna stato
      setStats({
        activeEmployees,
        hoursWorkedToday: Math.round(hoursWorkedToday * 10) / 10,
        activeEmployeesToday,
        missingTimesheetsYesterday: Math.max(0, missingTimesheetsYesterday),
        monthlyConsolidationPercentage,
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper per colore progress bar
  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Helper per colore badge
  const getBadgeVariant = (alertLevel: string): "default" | "secondary" | "destructive" | "outline" => {
    if (alertLevel === 'danger') return 'destructive';
    if (alertLevel === 'warning') return 'secondary';
    return 'outline';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-20 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ============================================
          KPI CARDS (4 METRICHE)
      ============================================ */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* 1. Dipendenti Attivi */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Totale dipendenti attivi
            </p>
          </CardContent>
        </Card>

        {/* 2. Ore Lavorate Oggi */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lavorate Oggi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.hoursWorkedToday}h</div>
            <p className="text-xs text-muted-foreground">
              Da {stats.activeEmployeesToday} dipendenti
            </p>
          </CardContent>
        </Card>

        {/* 3. Timesheets Mancanti Ieri */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timesheets Mancanti</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.missingTimesheetsYesterday}</div>
            <p className="text-xs text-muted-foreground">
              {stats.missingTimesheetsYesterday > 0 ? (
                <span className="text-orange-600 font-medium">⚠️ Compilare giorno precedente</span>
              ) : (
                <span className="text-green-600">✓ Tutti aggiornati</span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* 4. Consolidato Mensile % */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidato Mensile</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.monthlyConsolidationPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              Giorni lavorativi compilati
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ============================================
          TOP 3 STRAORDINARI (Ultimi 30 giorni)
      ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top 3 Dipendenti - Straordinari (Ultimi 30 Giorni)
          </CardTitle>
          <CardDescription>
            Soglia mensile: 22 ore (1h/giorno lavorativo)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topOvertime.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nessun dato disponibile per gli ultimi 30 giorni</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topOvertime.map((employee, index) => (
                <div key={index} className="space-y-2">
                  {/* Header riga */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {employee.first_name} {employee.last_name}
                      </span>
                      <Badge variant={getBadgeVariant(employee.alert_level)}>
                        {employee.alert_level === 'danger' && '🔴'}
                        {employee.alert_level === 'warning' && '🟡'}
                        {employee.alert_level === 'ok' && '🟢'}
                        {employee.alert_level === 'danger' ? ' Critico' : 
                         employee.alert_level === 'warning' ? ' Attenzione' : ' OK'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">
                        {employee.overtime_hours}h / {employee.threshold}h
                      </div>
                      {employee.percentage > 100 && (
                        <div className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          +{employee.percentage - 100}% sopra soglia
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <Progress 
                      value={Math.min(employee.percentage, 100)} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{employee.days_worked} giorni lavorati</span>
                      <span>{employee.percentage}% della soglia</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          SEZIONI STATICHE (Attività Recenti + Avvisi)
      ============================================ */}
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
              {stats.missingTimesheetsYesterday > 0 && (
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 bg-destructive rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">{stats.missingTimesheetsYesterday} timesheets mancanti</p>
                    <p className="text-xs text-muted-foreground">Dipendenti senza registrazioni ieri</p>
                  </div>
                </div>
              )}
              {topOvertime.some(e => e.alert_level === 'danger') && (
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Straordinari elevati</p>
                    <p className="text-xs text-muted-foreground">
                      {topOvertime.filter(e => e.alert_level === 'danger').length} dipendenti oltre soglia
                    </p>
                  </div>
                </div>
              )}
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
