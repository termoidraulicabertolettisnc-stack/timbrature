import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Users, Clock, BarChart3, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface ConsolidatedData {
  user_id: string;
  employee_name: string;
  total_hours: number;
  overtime_hours: number;
  night_hours: number;
  saturday_hours: number;
  worked_days: number;
  meal_vouchers: number;
}

interface DailyData {
  date: string;
  total_employees: number;
  total_hours: number;
  overtime_hours: number;
  presence_percentage: number;
}

export default function AdminConsolidation() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'custom'>('month');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedPeriod !== 'custom') {
      updateDatesForPeriod();
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadConsolidatedData();
  }, [startDate, endDate, selectedEmployee]);

  const updateDatesForPeriod = () => {
    const now = new Date();
    if (selectedPeriod === 'week') {
      setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else if (selectedPeriod === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    }
  };

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('is_active', true)
        .order('first_name');

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const loadConsolidatedData = async () => {
    setLoading(true);
    try {
      // Query per dati consolidati dipendenti
      let query = supabase
        .from('timesheets')
        .select(`
          user_id,
          total_hours,
          overtime_hours,
          night_hours,
          is_saturday,
          meal_voucher_earned,
          date,
          profiles (
            first_name,
            last_name
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (selectedEmployee !== 'all') {
        query = query.eq('user_id', selectedEmployee);
      }

      const { data: timesheetData, error } = await query;
      if (error) throw error;

      // Elabora dati per consolidato dipendenti
      const consolidated = processConsolidatedData(timesheetData || []);
      setConsolidatedData(consolidated);

      // Elabora dati giornalieri
      const daily = processDailyData(timesheetData || []);
      setDailyData(daily);

    } catch (error) {
      console.error('Error loading consolidated data:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati consolidati",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processConsolidatedData = (data: any[]): ConsolidatedData[] => {
    const userMap = new Map();

    data.forEach((record) => {
      const userId = record.user_id;
      const employeeName = record.profiles 
        ? `${record.profiles.first_name} ${record.profiles.last_name}`
        : 'Nome non disponibile';

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          employee_name: employeeName,
          total_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          saturday_hours: 0,
          worked_days: 0,
          meal_vouchers: 0,
        });
      }

      const user = userMap.get(userId);
      user.total_hours += record.total_hours || 0;
      user.overtime_hours += record.overtime_hours || 0;
      user.night_hours += record.night_hours || 0;
      if (record.is_saturday) {
        user.saturday_hours += record.total_hours || 0;
      }
      user.worked_days += 1;
      if (record.meal_voucher_earned) {
        user.meal_vouchers += 1;
      }
    });

    return Array.from(userMap.values());
  };

  const processDailyData = (data: any[]): DailyData[] => {
    const dateMap = new Map();
    const totalEmployees = employees.length;

    // Crea mappa di tutti i giorni nel periodo
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const days = eachDayOfInterval({ start, end });

    days.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      dateMap.set(dateStr, {
        date: dateStr,
        total_employees: 0,
        total_hours: 0,
        overtime_hours: 0,
        presence_percentage: 0,
      });
    });

    // Elabora i dati effettivi
    data.forEach((record) => {
      const dateStr = record.date;
      if (!dateMap.has(dateStr)) return;

      const dayData = dateMap.get(dateStr);
      dayData.total_employees += 1;
      dayData.total_hours += record.total_hours || 0;
      dayData.overtime_hours += record.overtime_hours || 0;
    });

    // Calcola percentuale presenze
    dateMap.forEach((dayData) => {
      dayData.presence_percentage = totalEmployees > 0 
        ? (dayData.total_employees / totalEmployees) * 100 
        : 0;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  const exportData = () => {
    toast({
      title: "Export",
      description: "Funzionalità di export in sviluppo",
    });
  };

  const formatHours = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  const getTotalStats = () => {
    const totals = consolidatedData.reduce((acc, curr) => ({
      total_hours: acc.total_hours + curr.total_hours,
      overtime_hours: acc.overtime_hours + curr.overtime_hours,
      night_hours: acc.night_hours + curr.night_hours,
      saturday_hours: acc.saturday_hours + curr.saturday_hours,
      meal_vouchers: acc.meal_vouchers + curr.meal_vouchers,
    }), { total_hours: 0, overtime_hours: 0, night_hours: 0, saturday_hours: 0, meal_vouchers: 0 });

    return totals;
  };

  const totals = getTotalStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Consolidato Presenze</h2>
          <p className="text-muted-foreground">
            Analisi consolidata delle ore lavorate e delle presenze
          </p>
        </div>
        <Button onClick={exportData} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Esporta Dati
        </Button>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader>
          <CardTitle>Filtri e Periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Periodo</label>
              <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Settimana Corrente</SelectItem>
                  <SelectItem value="month">Mese Corrente</SelectItem>
                  <SelectItem value="custom">Personalizzato</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data Inizio</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={selectedPeriod !== 'custom'}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data Fine</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={selectedPeriod !== 'custom'}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Dipendente</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i dipendenti</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.user_id} value={employee.user_id}>
                      {employee.first_name} {employee.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={loadConsolidatedData} className="w-full">
                Aggiorna
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistiche Generali */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Totali</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totals.total_hours)}</div>
            <p className="text-xs text-muted-foreground">Nel periodo selezionato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Straordinari</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totals.overtime_hours)}</div>
            <p className="text-xs text-muted-foreground">Ore straordinario totali</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Notturne</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totals.night_hours)}</div>
            <p className="text-xs text-muted-foreground">Ore in fascia notturna</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Sabato</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(totals.saturday_hours)}</div>
            <p className="text-xs text-muted-foreground">Ore lavorate il sabato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Buoni Pasto</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.meal_vouchers}</div>
            <p className="text-xs text-muted-foreground">Buoni pasto erogati</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs per le diverse viste */}
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="employees">Consolidato Dipendenti</TabsTrigger>
          <TabsTrigger value="daily">Andamento Giornaliero</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Riepilogo per Dipendente
              </CardTitle>
              <CardDescription>
                Dettaglio ore lavorate per ogni dipendente nel periodo selezionato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dipendente</TableHead>
                      <TableHead>Giorni Lavorati</TableHead>
                      <TableHead>Ore Totali</TableHead>
                      <TableHead>Straordinari</TableHead>
                      <TableHead>Ore Notturne</TableHead>
                      <TableHead>Ore Sabato</TableHead>
                      <TableHead>Buoni Pasto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nessun dato disponibile per il periodo selezionato
                        </TableCell>
                      </TableRow>
                    ) : (
                      consolidatedData.map((employee) => (
                        <TableRow key={employee.user_id}>
                          <TableCell className="font-medium">{employee.employee_name}</TableCell>
                          <TableCell>{employee.worked_days}</TableCell>
                          <TableCell>{formatHours(employee.total_hours)}</TableCell>
                          <TableCell>{formatHours(employee.overtime_hours)}</TableCell>
                          <TableCell>{formatHours(employee.night_hours)}</TableCell>
                          <TableCell>{formatHours(employee.saturday_hours)}</TableCell>
                          <TableCell>
                            <Badge variant="default">{employee.meal_vouchers}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Andamento Giornaliero
              </CardTitle>
              <CardDescription>
                Presenze e ore lavorate per ogni giorno del periodo selezionato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Dipendenti Presenti</TableHead>
                      <TableHead>% Presenza</TableHead>
                      <TableHead>Ore Totali</TableHead>
                      <TableHead>Straordinari</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyData.map((day) => (
                      <TableRow key={day.date}>
                        <TableCell className="font-medium">
                          {format(parseISO(day.date), 'EEEE dd/MM/yyyy', { locale: it })}
                        </TableCell>
                        <TableCell>{day.total_employees}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={day.presence_percentage >= 80 ? "default" : day.presence_percentage >= 60 ? "secondary" : "destructive"}
                          >
                            {day.presence_percentage.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell>{formatHours(day.total_hours)}</TableCell>
                        <TableCell>{formatHours(day.overtime_hours)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}