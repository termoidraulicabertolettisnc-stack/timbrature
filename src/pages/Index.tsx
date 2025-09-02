import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Clock, LogOut, User } from 'lucide-react';
import TimesheetEntry from '@/components/TimesheetEntry';
import TimesheetHistory from '@/components/TimesheetHistory';
import TimesheetStats from '@/components/TimesheetStats';

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

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Timesheet Entry */}
          <div className="lg:col-span-1">
            <TimesheetEntry />
          </div>

          {/* Right Column - History and Stats */}
          <div className="lg:col-span-2 space-y-6">
            <TimesheetStats />
            <TimesheetHistory />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
