import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogOut, User } from 'lucide-react';

const Index = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Clock className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
          <p className="text-lg text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-primary mr-2" />
            <h1 className="text-2xl font-bold text-foreground">TimeTracker</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>{user.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Esci
            </Button>
          </div>
        </div>

        {/* Welcome Section */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Benvenuto!</CardTitle>
              <CardDescription>
                Inizia a tracciare le tue ore di lavoro
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                L'app è pronta per l'uso. Presto potrai timbrare entrate e uscite.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prossimi Passi</CardTitle>
              <CardDescription>
                Funzionalità in arrivo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Timbratura con GPS</li>
                <li>• Gestione commesse</li>
                <li>• Report mensili</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Il Tuo Profilo</CardTitle>
              <CardDescription>
                Informazioni account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Email: </span>
                  <span className="text-muted-foreground">{user.email}</span>
                </div>
                <div>
                  <span className="font-medium">ID: </span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {user.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
