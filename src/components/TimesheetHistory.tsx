import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Clock, MapPin, FileText } from 'lucide-react';

interface TimesheetRecord {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
  overtime_hours: number | null;
  night_hours: number | null;
  notes: string | null;
  project: {
    name: string;
  } | null;
}

const TimesheetHistory = () => {
  const [timesheets, setTimesheets] = useState<TimesheetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadTimesheets();
    }
  }, [user]);

  const loadTimesheets = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        id,
        date,
        start_time,
        end_time,
        total_hours,
        overtime_hours,
        night_hours,
        notes,
        project:projects(name)
      `)
      .eq('user_id', user?.id)
      .order('date', { ascending: false })
      .limit(10);

    if (error) {
      toast({
        title: "Errore",
        description: "Impossibile caricare lo storico",
        variant: "destructive",
      });
    } else {
      setTimesheets(data || []);
    }
    
    setIsLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '--:--';
    return new Date(timeStr).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatHours = (hours: number | null) => {
    if (!hours) return '0:00';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Storico Timbrature
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-spin" />
            <p className="text-muted-foreground">Caricamento...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Storico Timbrature
        </CardTitle>
        <CardDescription>
          Ultime 10 giornate lavorative
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timesheets.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Nessuna timbratura</p>
            <p className="text-muted-foreground">
              Inizia a timbrare per vedere lo storico
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {timesheets.map((timesheet) => (
              <div
                key={timesheet.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatDate(timesheet.date)}
                    </span>
                    {timesheet.project && (
                      <Badge variant="secondary">
                        {timesheet.project.name}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {timesheet.total_hours ? formatHours(timesheet.total_hours) : 'In corso'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Entrata: {formatTime(timesheet.start_time)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Uscita: {formatTime(timesheet.end_time)}</span>
                  </div>
                </div>

                {(timesheet.overtime_hours || timesheet.night_hours) && (
                  <div className="flex gap-2 mt-2">
                    {timesheet.overtime_hours && timesheet.overtime_hours > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Straord: {formatHours(timesheet.overtime_hours)}
                      </Badge>
                    )}
                    {timesheet.night_hours && timesheet.night_hours > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Notturno: {formatHours(timesheet.night_hours)}
                      </Badge>
                    )}
                  </div>
                )}

                {timesheet.notes && (
                  <div className="flex items-start gap-2 mt-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">{timesheet.notes}</span>
                  </div>
                )}
              </div>
            ))}

            <Button variant="outline" className="w-full">
              Visualizza tutto lo storico
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimesheetHistory;