import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLayout } from "./layouts/AdminLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTimesheets from "./pages/admin/AdminTimesheets";
import AdminEmployees from "./pages/admin/AdminEmployees";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminClients from "./pages/admin/AdminClients";
import AdminConsolidation from "./pages/admin/AdminConsolidation";
import AdminExport from "./pages/admin/AdminExport";
import AdminAudit from "./pages/admin/AdminAudit";

// Quick test login component for debugging
const TestLogin = () => {
  const handleTestLogin = async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      "https://lhunsfvyegrjgejfgmwt.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodW5zZnZ5ZWdyamdlamZnbXd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MjIyMzMsImV4cCI6MjA3MjM5ODIzM30.Z9ZvtkRx8yEOYKoRnNZ2SFf2RH57jv0lmPYZknZchBQ"
    );
    
    // Try to sign in with test credentials
    const { error } = await supabase.auth.signInWithPassword({
      email: 'thomas.bertoletti@bertolettigroup.com',
      password: 'test123' // You'll need to set this password for the user
    });
    
    if (error) {
      console.log('❌ Test login failed:', error.message);
      alert('Test login fallito: ' + error.message);
    } else {
      console.log('✅ Test login successful');
      window.location.href = '/admin';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Sistema di Test - Login Automatico</h1>
        <p className="text-muted-foreground">Clicca il pulsante per effettuare il login di test</p>
        <button 
          onClick={handleTestLogin}
          className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90"
        >
          Login di Test (Admin)
        </button>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Se il login fallisce, vai alla pagina Auth normale e registrati
          </p>
        </div>
      </div>
    </div>
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minuti - dati considerati "fresh"
      gcTime: 10 * 60 * 1000, // 10 minuti - cache mantenuta in memoria (era cacheTime)
      refetchOnWindowFocus: false, // NON ricaricare quando torni sulla finestra
      refetchOnMount: false, // NON ricaricare quando componente monta
      refetchOnReconnect: true, // Ricarica solo se perdi connessione
      retry: 1, // Riprova solo 1 volta in caso di errore
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/test-login" element={<TestLogin />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="timesheets" element={<AdminTimesheets />} />
              <Route path="employees" element={<AdminEmployees />} />
              <Route path="companies" element={<AdminCompanies />} />
              <Route path="clients" element={<AdminClients />} />
              <Route path="consolidation" element={<AdminConsolidation />} />
              <Route path="export" element={<AdminExport />} />
              <Route path="audit" element={<AdminAudit />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
