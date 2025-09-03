import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { toast } from 'sonner';

interface EmployeeOvertimeStats {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  total_overtime: number;
  total_regular_hours: number;
  working_days: number;
  daily_breakdown: {
    date: string;
    overtime_hours: number;
    total_hours: number;
    cumulative_overtime: number;
  }[];
  has_monthly_compensation: boolean;
}

export const OvertimeTracker = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeOvertimeStats[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOvertimeStats();
  }, [selectedMonth]);

  const loadOvertimeStats = async () => {
    try {
      setLoading(true);
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      // Get employees with monthly compensation from separate queries
      const { data: employeeSettings, error: settingsError } = await supabase
        .from('employee_settings')
        .select('user_id, overtime_monthly_compensation')
        .eq('overtime_monthly_compensation', true);

      if (settingsError) throw settingsError;

      if (!employeeSettings?.length) {
        setEmployees([]);
        return;
      }

      // Get profile data for these employees
      const userIds = employeeSettings.map(s => s.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds)
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      const employeeStats: EmployeeOvertimeStats[] = [];

      for (const profile of profiles || []) {
        // Get timesheets for this employee in the selected month
        const { data: timesheets, error: timesheetError } = await supabase
          .from('timesheets')
          .select('date, total_hours, overtime_hours')
          .eq('user_id', profile.user_id)
          .gte('date', format(startDate, 'yyyy-MM-dd'))
          .lte('date', format(endDate, 'yyyy-MM-dd'))
          .order('date');

        if (timesheetError) throw timesheetError;

        let cumulativeOvertime = 0;
        const dailyBreakdown = (timesheets || []).map(timesheet => {
          cumulativeOvertime += timesheet.overtime_hours || 0;
          return {
            date: timesheet.date,
            overtime_hours: timesheet.overtime_hours || 0,
            total_hours: timesheet.total_hours || 0,
            cumulative_overtime: cumulativeOvertime,
          };
        });

        const totalOvertime = dailyBreakdown.reduce((sum, day) => sum + day.overtime_hours, 0);
        const totalRegularHours = dailyBreakdown.reduce((sum, day) => sum + (day.total_hours - day.overtime_hours), 0);

        employeeStats.push({
          user_id: profile.user_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          total_overtime: totalOvertime,
          total_regular_hours: totalRegularHours,
          working_days: dailyBreakdown.length,
          daily_breakdown: dailyBreakdown,
          has_monthly_compensation: true,
        });
      }

      setEmployees(employeeStats);
    } catch (error) {
      console.error('Error loading overtime stats:', error);
      toast.error('Errore nel caricamento delle statistiche straordinari');
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = selectedEmployee === 'all' 
    ? employees 
    : employees.filter(emp => emp.user_id === selectedEmployee);

  const formatHours = (hours: number) => {
    const h = Math.floor(Math.abs(hours));
    const m = Math.round((Math.abs(hours) - h) * 60);
    const sign = hours < 0 ? '-' : '';
    return `${sign}${h}:${m.toString().padStart(2, '0')}`;
  };

  const getOvertimeStatus = (cumulativeOvertime: number) => {
    if (cumulativeOvertime > 4) return { variant: 'destructive' as const, label: 'Alto' };
    if (cumulativeOvertime > 2) return { variant: 'secondary' as const, label: 'Medio' };
    if (cumulativeOvertime > 0) return { variant: 'outline' as const, label: 'Basso' };
    return { variant: 'default' as const, label: 'Bilanciato' };
  };

  const generateMonth = (offset: number) => {
    const date = new Date();
    date.setMonth(date.getMonth() + offset);
    return format(date, 'yyyy-MM');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Monitoraggio Straordinari Mensili</h2>
          <p className="text-muted-foreground">
            Dipendenti con accordo di compensazione mensile degli straordinari
          </p>
        </div>
        <Button onClick={loadOvertimeStats} size="sm" className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-48">
            <CalendarIcon className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={generateMonth(-2)}>
              {format(new Date(generateMonth(-2) + '-01'), 'MMMM yyyy', { locale: it })}
            </SelectItem>
            <SelectItem value={generateMonth(-1)}>
              {format(new Date(generateMonth(-1) + '-01'), 'MMMM yyyy', { locale: it })}
            </SelectItem>
            <SelectItem value={generateMonth(0)}>
              {format(new Date(generateMonth(0) + '-01'), 'MMMM yyyy', { locale: it })}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Seleziona dipendente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i dipendenti</SelectItem>
            {employees.map(emp => (
              <SelectItem key={emp.user_id} value={emp.user_id}>
                {emp.first_name} {emp.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Caricamento...</div>
          </CardContent>
        </Card>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Nessun dipendente con compensazione mensile trovato per il periodo selezionato
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredEmployees.map(employee => {
            const latestCumulative = employee.daily_breakdown[employee.daily_breakdown.length - 1]?.cumulative_overtime || 0;
            const status = getOvertimeStatus(latestCumulative);
            
            return (
              <Card key={employee.user_id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-3">
                        {employee.first_name} {employee.last_name}
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </CardTitle>
                      <CardDescription>{employee.email}</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {formatHours(latestCumulative)}
                      </div>
                      <div className="text-sm text-muted-foreground">Saldo attuale</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-lg font-semibold">{formatHours(employee.total_overtime)}</div>
                      <div className="text-sm text-muted-foreground">Straordinari Totali</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-lg font-semibold">{formatHours(employee.total_regular_hours)}</div>
                      <div className="text-sm text-muted-foreground">Ore Regolari</div>
                    </div>
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-lg font-semibold">{employee.working_days}</div>
                      <div className="text-sm text-muted-foreground">Giorni Lavorati</div>
                    </div>
                  </div>

                  {employee.daily_breakdown.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Dettaglio Giornaliero</h4>
                      <div className="max-h-64 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead className="text-right">Ore Totali</TableHead>
                              <TableHead className="text-right">Straordinari</TableHead>
                              <TableHead className="text-right">Saldo</TableHead>
                              <TableHead className="text-right">Trend</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {employee.daily_breakdown.map((day, index) => {
                              const prevCumulative = index > 0 ? employee.daily_breakdown[index - 1].cumulative_overtime : 0;
                              const trend = day.cumulative_overtime > prevCumulative;
                              
                              return (
                                <TableRow key={day.date}>
                                  <TableCell>
                                    {format(parseISO(day.date), 'dd/MM', { locale: it })}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatHours(day.total_hours)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge variant={day.overtime_hours > 0 ? "secondary" : "outline"}>
                                      {formatHours(day.overtime_hours)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatHours(day.cumulative_overtime)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {day.overtime_hours > 0 && (
                                      trend ? (
                                        <TrendingUp className="h-4 w-4 text-red-500" />
                                      ) : (
                                        <TrendingDown className="h-4 w-4 text-green-500" />
                                      )
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};