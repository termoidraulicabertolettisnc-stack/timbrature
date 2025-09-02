import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, MapPin, Play, Square } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface TodayTimesheet {
  id: string;
  start_time: string | null;
  end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  project_id: string | null;
  notes: string | null;
}

const TimesheetEntry = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [todayTimesheet, setTodayTimesheet] = useState<TodayTimesheet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const { user } = useAuth();
  const { toast } = useToast();

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load projects and today's timesheet
  useEffect(() => {
    if (user) {
      loadProjects();
      loadTodayTimesheet();
    }
  }, [user]);

  const loadProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    if (error) {
      toast({
        title: "Errore",
        description: "Impossibile caricare le commesse",
        variant: "destructive",
      });
    } else {
      setProjects(data || []);
    }
  };

  const loadTodayTimesheet = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('timesheets')
      .select('*')
      .eq('user_id', user?.id)
      .eq('date', today)
      .maybeSingle();

    if (error) {
      toast({
        title: "Errore",
        description: "Impossibile caricare il timesheet di oggi",
        variant: "destructive",
      });
    } else {
      setTodayTimesheet(data);
      if (data) {
        setSelectedProject(data.project_id || '');
        setNotes(data.notes || '');
      }
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalizzazione non supportata'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  };

  const clockIn = async () => {
    setIsLoading(true);
    
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];

      let error;
      
      if (todayTimesheet) {
        // Update existing timesheet
        const result = await supabase
          .from('timesheets')
          .update({
            start_time: now,
            start_location_lat: location.lat,
            start_location_lng: location.lng,
            project_id: selectedProject || null,
            notes: notes || null,
          })
          .eq('id', todayTimesheet.id);
        error = result.error;
      } else {
        // Create new timesheet
        const result = await supabase
          .from('timesheets')
          .insert({
            user_id: user?.id,
            date: today,
            start_time: now,
            start_location_lat: location.lat,
            start_location_lng: location.lng,
            project_id: selectedProject || null,
            notes: notes || null,
            created_by: user?.id,
          });
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: "Entrata registrata!",
        description: `Ore ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`,
      });

      loadTodayTimesheet();
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile registrare l'entrata",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clockOut = async () => {
    if (!todayTimesheet) return;

    setIsLoading(true);
    
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('timesheets')
        .update({
          end_time: now,
          end_location_lat: location.lat,
          end_location_lng: location.lng,
          notes: notes || null,
        })
        .eq('id', todayTimesheet.id);

      if (error) throw error;

      toast({
        title: "Uscita registrata!",
        description: `Ore ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`,
      });

      loadTodayTimesheet();
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile registrare l'uscita",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isWorking = todayTimesheet?.start_time && !todayTimesheet?.end_time;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timbratura
            </CardTitle>
            <CardDescription>
              {currentTime.toLocaleString('it-IT', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {currentTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-sm text-muted-foreground">
              {isWorking ? 'In servizio' : 'Fuori servizio'}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Commessa</label>
          <Select value={selectedProject} onValueChange={setSelectedProject} disabled={isWorking}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona una commessa" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Note (opzionale)</label>
          <Textarea
            placeholder="Aggiungi delle note..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {todayTimesheet && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm space-y-1">
              {todayTimesheet.start_time && (
                <div className="flex justify-between">
                  <span>Entrata:</span>
                  <span className="font-medium">
                    {new Date(todayTimesheet.start_time).toLocaleTimeString('it-IT', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              )}
              {todayTimesheet.end_time && (
                <div className="flex justify-between">
                  <span>Uscita:</span>
                  <span className="font-medium">
                    {new Date(todayTimesheet.end_time).toLocaleTimeString('it-IT', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!isWorking ? (
            <Button
              onClick={clockIn}
              disabled={isLoading}
              className="flex-1"
              size="lg"
            >
              <Play className="h-4 w-4 mr-2" />
              Entra
            </Button>
          ) : (
            <Button
              onClick={clockOut}
              disabled={isLoading}
              variant="destructive"
              className="flex-1"
              size="lg"
            >
              <Square className="h-4 w-4 mr-2" />
              Esci
            </Button>
          )}
          <Button variant="outline" size="lg">
            <MapPin className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TimesheetEntry;