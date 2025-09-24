import { Navigate } from 'react-router-dom';
import { useAdmin } from '@/hooks/use-admin';
import { Clock } from 'lucide-react';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAdmin, loading } = useAdmin();

  console.log('🛡️ AdminRoute - isAdmin:', isAdmin, 'loading:', loading);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Verifica autorizzazioni...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    console.log('🚫 Not admin - redirecting to /auth');
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};