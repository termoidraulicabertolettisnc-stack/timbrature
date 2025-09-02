import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, Clock, Calendar, Zap } from 'lucide-react';

interface MonthlyStats {
  totalHours: number;
  overtimeHours: number;
  nightHours: number;
  workingDays: number;
}

const TimesheetStats = () => {
  const [stats, setStats] = useState<MonthlyStats>({
    totalHours: 0,
    overtimeHours: 0,
    nightHours: 0,
    workingDays: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  // Aggiungi polling per aggiornare le statistiche ogni 30 secondi
  useEffect(() => {
    const interval = setInterval(() => {
      if (user) {
        loadStats();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [user]);

  const loadStats = async () => {
    setIsLoading(true);
    
    // Get current month's first and last day
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const { data, error } = await supabase
      .from('timesheets')
      .select('date, start_time, end_time, total_hours, overtime_hours, night_hours')
      .eq('user_id', user?.id)
      .gte('date', firstDay.toISOString().split('T')[0])
      .lte('date', lastDay.toISOString().split('T')[0])
      .not('start_time', 'is', null);

    if (error) {
      toast({
        title: "Errore",
        description: "Impossibile caricare le statistiche",
        variant: "destructive",
      });
    } else {
      // Raggruppa per data per contare correttamente i giorni lavorativi
      const dayGroups = data.reduce((acc, curr) => {
        const dateKey = curr.date;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(curr);
        return acc;
      }, {} as Record<string, typeof data>);

      // Calcola statistiche per giorno e poi somma
      const monthlyStats = Object.values(dayGroups).reduce(
        (acc, daySessions) => {
          let dayTotalHours = 0;
          let dayOvertimeHours = 0;
          let dayNightHours = 0;

          // Somma tutte le sessioni del giorno
          daySessions.forEach(session => {
            let sessionHours = session.total_hours || 0;
            if (!session.total_hours && session.start_time && session.end_time) {
              const start = new Date(session.start_time);
              const end = new Date(session.end_time);
              sessionHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            }

            dayTotalHours += sessionHours;
            dayOvertimeHours += session.overtime_hours || 0;
            dayNightHours += session.night_hours || 0;
          });

          // Se il giorno ha ore lavorate, conta come giorno lavorativo
          const hasWorkedHours = dayTotalHours > 0;

          return {
            totalHours: acc.totalHours + dayTotalHours,
            overtimeHours: acc.overtimeHours + dayOvertimeHours,
            nightHours: acc.nightHours + dayNightHours,
            workingDays: acc.workingDays + (hasWorkedHours ? 1 : 0),
          };
        },
        { totalHours: 0, overtimeHours: 0, nightHours: 0, workingDays: 0 }
      );
      
      setStats(monthlyStats);
    }
    
    setIsLoading(false);
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  const getCurrentMonth = () => {
    return new Date().toLocaleDateString('it-IT', {
      month: 'long',
      year: 'numeric'
    });
  };

  const averageHoursPerDay = stats.workingDays > 0 ? stats.totalHours / stats.workingDays : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Statistiche Mensili
        </CardTitle>
        <CardDescription>
          Riepilogo per {getCurrentMonth()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-primary/10 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary">
                  {formatHours(stats.totalHours)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Ore Totali
                </div>
              </div>
              
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">
                  {stats.workingDays}
                </div>
                <div className="text-sm text-muted-foreground">
                  Giorni Lavorativi
                </div>
              </div>
            </div>

            {/* Additional Stats */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-500" />
                  <span className="text-sm">Ore Straordinarie</span>
                </div>
                <span className="font-medium">
                  {formatHours(stats.overtimeHours)}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Ore Notturne</span>
                </div>
                <span className="font-medium">
                  {formatHours(stats.nightHours)}
                </span>
              </div>
              
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <span className="text-sm">Media Giornaliera</span>
                </div>
                <span className="font-medium">
                  {formatHours(averageHoursPerDay)}
                </span>
              </div>
            </div>

            {stats.workingDays === 0 && (
              <div className="text-center py-4">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">Nessun dato</p>
                <p className="text-muted-foreground text-sm">
                  Inizia a timbrare per vedere le statistiche
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimesheetStats;