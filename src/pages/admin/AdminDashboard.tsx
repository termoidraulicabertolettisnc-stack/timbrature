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

interface HybridOvertimeEmployee {
  first_name: string;
  last_name: string;
  // Ultimo mese
  last_30d_hours: number;
  last_30d_days: number;
  // Anno solare (conformità normativa)
  ytd_hours: number;
  ytd_percentage: number;
  ytd_remaining: number;
  // Anno mobile (trend)
  rolling_12m_hours: number;
  rolling_12m_percentage: number;
  // Alert
  alert_level: 'ok' | 'attention' | 'warning' | 'danger' | 'critical';
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
// DASHBOARD OVERVIEW (VERSIONE IBRIDA)
// ============================================

function OverviewDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    activeEmployees: 0,
    hoursWorkedToday: 0,
    activeEmployeesToday: 0,
    missingTimesheetsYesterday: 0,
    monthlyConsolidationPercentage: 0,
  });
  const [overtimeData, setOvertimeData] = useState<HybridOvertimeEmployee[]>([]);
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

      // 4. Consolidato Mensile
      const startOfCurrentMonth = startOfMonth(new Date());
      const daysInMonth = eachDayOfInterval({
        start: startOfCurrentMonth,
        end: new Date(),
      });

      const workingDays = daysInMonth.filter(day => !isWeekend(day)).length;

      const { data: monthTimesheets, error: monthError } = await supabase
        .from('timesheets')
        .select('date, user_id')
        .gte('date', format(startOfCurrentMonth, 'yyyy-MM-dd'))
        .lte('date', today);

      if (monthError) throw monthError;

      const compiledDaysSet = new Set(monthTimesheets?.map(t => t.date) || []);
      const compiledDays = compiledDaysSet.size;

      const monthlyConsolidationPercentage = workingDays > 0 
        ? Math.round((compiledDays / workingDays) * 100) 
        : 0;

      // 5. Straordinari Ibridi (NUOVA FUNZIONE SQL)
      const { data: overtimeResponse, error: overtimeError } = await supabase
        .rpc('get_overtime_hybrid_view');

      if (overtimeError) {
        console.error('Error loading overtime data:', overtimeError);
        setOvertimeData([]);
      } else {
        // Prendi solo i top 3
        setOvertimeData((overtimeResponse || []).slice(0, 3));
      }

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

  // Helper per colore badge
  const getBadgeVariant = (alertLevel: string): "default" | "secondary" | "destructive" | "outline" => {
    if (alertLevel === 'critical') return 'destructive';
    if (alertLevel === 'danger') return 'destructive';
    if (alertLevel === 'warning') return 'secondary';
    return 'outline';
  };

  // Helper per icona badge
  const getAlertIcon = (alertLevel: string) => {
    if (alertLevel === 'critical') return '🔴';
    if (alertLevel === 'danger') return '🟠';
    if (alertLevel === 'warning') return '🟡';
    if (alertLevel === 'attention') return '🟢';
    return '✅';
  };

  // Helper per label badge
  const getAlertLabel = (alertLevel: string) => {
    if (alertLevel === 'critical') return 'Critico';
    if (alertLevel === 'danger') return 'Pericolo';
    if (alertLevel === 'warning') return 'Attenzione';
    if (alertLevel === 'attention') return 'Monitorare';
    return 'OK';
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
          TOP 3 STRAORDINARI - VISTA IBRIDA
      ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top 3 Dipendenti - Straordinari (Vista Ibrida)
          </CardTitle>
          <CardDescription>
            Limite normativo: 250 ore/anno (D.Lgs. 66/2003) - Anno solare: 1 gen - 31 dic
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overtimeData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nessun dato straordinari disponibile</p>
            </div>
          ) : (
            <div className="space-y-6">
              {overtimeData.map((employee, index) => (
                <div key={index} className="space-y-3 pb-4 border-b last:border-b-0">
                  {/* Header dipendente */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {employee.first_name} {employee.last_name}
                      </span>
                      <Badge variant={getBadgeVariant(employee.alert_level)}>
                        {getAlertIcon(employee.alert_level)} {getAlertLabel(employee.alert_level)}
                      </Badge>
                    </div>
                  </div>

                  {/* Metriche dettagliate */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    {/* Ultimo Mese */}
                    <div className="bg-muted/50 p-3 rounded-md">
                      <div className="text-xs text-muted-foreground mb-1">Ultimo Mese</div>
                      <div className="font-bold">{employee.last_30d_hours}h</div>
                      <div className="text-xs text-muted-foreground">
                        {employee.last_30d_days} giorni lavorati
                      </div>
                    </div>

                    {/* Anno Solare (Conformità) */}
                    <div className={`p-3 rounded-md ${
                      employee.ytd_percentage >= 100 ? 'bg-red-50 border border-red-200' :
                      employee.ytd_percentage >= 80 ? 'bg-yellow-50 border border-yellow-200' :
                      'bg-green-50 border border-green-200'
                    }`}>
                      <div className="text-xs text-muted-foreground mb-1">
                        Anno {new Date().getFullYear()} (Normativo)
                      </div>
                      <div className="font-bold">
                        {employee.ytd_hours}h / 250h
                      </div>
                      <div className="text-xs">
                        {employee.ytd_percentage}% • {employee.ytd_remaining}h disponibili
                      </div>
                    </div>

                    {/* Anno Mobile (Trend) */}
                    <div className={`p-3 rounded-md ${
                      employee.rolling_12m_percentage >= 100 ? 'bg-orange-50 border border-orange-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}>
                      <div className="text-xs text-muted-foreground mb-1">Ultimi 12 Mesi (Trend)</div>
                      <div className="font-bold">
                        {employee.rolling_12m_hours}h
                      </div>
                      <div className="text-xs">
                        {employee.rolling_12m_percentage}% del limite
                        {employee.rolling_12m_percentage > 100 && (
                          <span className="text-orange-600 font-semibold ml-1">
                            ⚠️ +{employee.rolling_12m_percentage - 100}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar (basata su anno solare) */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso Anno Solare</span>
                      <span>{employee.ytd_percentage}%</span>
                    </div>
                    <Progress 
                      value={Math.min(employee.ytd_percentage, 100)} 
                      className={`h-2 ${
                        employee.ytd_percentage >= 100 ? 'bg-red-100' :
                        employee.ytd_percentage >= 80 ? 'bg-yellow-100' :
                        'bg-green-100'
                      }`}
                    />
                  </div>

                  {/* Alert Reason */}
                  {employee.alert_level !== 'ok' && (
                    <div className={`flex items-start gap-2 p-2 rounded text-xs ${
                      employee.alert_level === 'critical' || employee.alert_level === 'danger' 
                        ? 'bg-red-50 text-red-800' 
                        : employee.alert_level === 'warning'
                        ? 'bg-yellow-50 text-yellow-800'
                        : 'bg-blue-50 text-blue-800'
                    }`}>
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{employee.alert_reason}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          SEZIONI STATICHE (Attività + Avvisi)
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
              {overtimeData.some(e => e.alert_level === 'critical' || e.alert_level === 'danger') && (
                <div className="flex items-start gap-2">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Straordinari elevati</p>
                    <p className="text-xs text-muted-foreground">
                      {overtimeData.filter(e => e.alert_level === 'critical' || e.alert_level === 'danger').length} dipendenti richiedono attenzione
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
