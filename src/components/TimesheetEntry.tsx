import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, MapPin, Play, Square, Navigation } from 'lucide-react';
import LocationModal from './LocationModal';
import { useAdaptiveLocationTracking } from '@/hooks/use-adaptive-location-tracking';
import { Badge } from '@/components/ui/badge';

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
  const [todayTimesheets, setTodayTimesheets] = useState<TodayTimesheet[]>([]);
  const [currentSession, setCurrentSession] = useState<TodayTimesheet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();

  // Adaptive location tracking
  const locationTracking = useAdaptiveLocationTracking({
    timesheetId: currentSession?.id || null,
    userId: user?.id || '',
    isActive: !!currentSession && !currentSession.end_time
  });

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
    if (!user) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Carica i timesheets di oggi (approccio semplice)
      const { data: timesheets, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('date', { ascending: false });

      if (error) throw error;
      setTodayTimesheets(timesheets || []);

      // Cerca sessioni aperte per questo utente (senza relazioni)
      const { data: openSessions, error: openError } = await supabase
        .from('timesheet_sessions')
        .select('*')
        .is('end_time', null)
        .eq('session_type', 'work')
        .order('start_time', { ascending: false })
        .limit(10);

      if (openError) {
        console.error('Error loading open sessions:', openError);
        setCurrentSession(null);
        return;
      }

      // Se ci sono sessioni aperte, trova quella dell'utente corrente
      if (openSessions && openSessions.length > 0) {
        // Per ogni sessione aperta, carica il timesheet associato
        for (const session of openSessions) {
          const { data: timesheetData, error: timesheetError } = await supabase
            .from('timesheets')
            .select('*')
            .eq('id', session.timesheet_id)
            .eq('user_id', user.id)
            .single();

          if (!timesheetError && timesheetData) {
            // Trovata una sessione dell'utente corrente
            setCurrentSession({
              id: timesheetData.id,
              start_time: session.start_time,
              end_time: null,
              lunch_start_time: null,
              lunch_end_time: null,
              project_id: timesheetData.project_id,
              notes: session.notes || timesheetData.notes
            });
            
            if (timesheetData.date !== today) {
              const oldDate = new Date(timesheetData.date).toLocaleDateString('it-IT');
              toast({
                title: "Sessione precedente aperta",
                description: `Sessione del ${oldDate} ancora aperta. Puoi timbrare l'uscita.`,
                variant: "destructive",
              });
            }
            return; // Esci dal loop
          }
        }
      }

      // Nessuna sessione aperta trovata
      setCurrentSession(null);

    } catch (error: any) {
      console.error('Error loading today timesheet:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle timbrature di oggi",
        variant: "destructive",
      });
      setCurrentSession(null);
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

      // 1. Trova o crea il timesheet per oggi
      let timesheetId;
      
      // Controlla se esiste già un timesheet per oggi
      const { data: existingTimesheet, error: fetchError } = await supabase
        .from('timesheets')
        .select('id')
        .eq('user_id', user?.id)
        .eq('date', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingTimesheet) {
        timesheetId = existingTimesheet.id;
      } else {
        // Crea un nuovo timesheet per oggi
        const { data: newTimesheet, error: insertError } = await supabase
          .from('timesheets')
          .insert({
            user_id: user?.id,
            date: today,
            start_time: now, // Il primo start_time del giorno
            project_id: selectedProject || null,
            notes: notes || null,
            created_by: user?.id,
            is_absence: false
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        timesheetId = newTimesheet.id;
      }

      // 2. Crea una nuova sessione di lavoro
      const { data: sessions, error: sessionCountError } = await supabase
        .from('timesheet_sessions')
        .select('session_order')
        .eq('timesheet_id', timesheetId)
        .order('session_order', { ascending: false })
        .limit(1);

      if (sessionCountError) throw sessionCountError;

      const nextSessionOrder = sessions && sessions.length > 0 ? sessions[0].session_order + 1 : 1;

      const { error: sessionError } = await supabase
        .from('timesheet_sessions')
        .insert({
          timesheet_id: timesheetId,
          session_order: nextSessionOrder,
          session_type: 'work',
          start_time: now,
          start_location_lat: location.lat,
          start_location_lng: location.lng,
          notes: notes || null
        });

      if (sessionError) throw sessionError;

      toast({
        title: "Entrata registrata!",
        description: `Ore ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - Sessione ${nextSessionOrder}`,
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
    if (!currentSession) return;

    setIsLoading(true);
    
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();

      // Trova TUTTE le sessioni aperte dell'utente (cerca tramite timesheets)
      const { data: allOpenSessions, error: fetchError } = await supabase
        .from('timesheet_sessions')
        .select('*, timesheets!inner(user_id)')
        .is('end_time', null)
        .eq('session_type', 'work')
        .eq('timesheets.user_id', user?.id)
        .order('start_time', { ascending: true })
        .limit(10);

      if (fetchError) throw fetchError;

      if (!allOpenSessions || allOpenSessions.length === 0) {
        throw new Error('Nessuna sessione di lavoro aperta trovata');
      }

      // Chiudi la sessione più vecchia (la prima nell'array)
      const oldestSession = allOpenSessions[0];
      
      const { error: sessionError } = await supabase
        .from('timesheet_sessions')
        .update({
          end_time: now,
          end_location_lat: location.lat,
          end_location_lng: location.lng,
          notes: notes || null,
        })
        .eq('id', oldestSession.id);

      if (sessionError) throw sessionError;

      // Se la sessione chiusa era vecchia, avvisa l'utente
      const sessionDate = new Date(oldestSession.start_time);
      const today = new Date();
      const isOldSession = sessionDate.toDateString() !== today.toDateString();

      toast({
        title: "Uscita registrata!",
        description: isOldSession 
          ? `Sessione del ${sessionDate.toLocaleDateString('it-IT')} chiusa alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
          : `Ore ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} - Sessione ${oldestSession.session_order}`,
        variant: isOldSession ? "default" : "default"
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

  const isWorking = currentSession?.start_time && !currentSession?.end_time;

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

        {todayTimesheets.length > 0 && (
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-sm space-y-2">
              <div className="font-medium">Sessioni di oggi:</div>
              {todayTimesheets.map((session, index) => (
                <div key={session.id} className="space-y-1 border-l-2 border-primary pl-2">
                  <div className="flex justify-between">
                    <span>Sessione {index + 1}:</span>
                  </div>
                  {session.start_time && (
                    <div className="flex justify-between">
                      <span>Entrata:</span>
                      <span className="font-medium">
                        {new Date(session.start_time).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  )}
                  {session.end_time && (
                    <div className="flex justify-between">
                      <span>Uscita:</span>
                      <span className="font-medium">
                        {new Date(session.end_time).toLocaleTimeString('it-IT', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                  )}
                  {!session.end_time && session.start_time && (
                    <div className="text-xs text-primary">Sessione attiva</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
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
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => setLocationModalOpen(true)}
            >
              <MapPin className="h-4 w-4" />
            </Button>
          </div>

          {locationTracking.isTracking && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Tracciamento Attivo</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {locationTracking.currentInterval}min
                </Badge>
              </div>
              
              <div className="text-xs text-green-700 space-y-1">
                <div>Ping inviati: {locationTracking.pingsCount}</div>
                {locationTracking.movementDetected && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span>Movimento rilevato</span>
                  </div>
                )}
                {locationTracking.error && (
                  <div className="text-red-600 font-medium">
                    {locationTracking.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <LocationModal 
          open={locationModalOpen} 
          onOpenChange={setLocationModalOpen} 
        />
      </CardContent>
    </Card>
  );
};

export default TimesheetEntry;