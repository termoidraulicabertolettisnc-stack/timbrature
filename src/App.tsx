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

import AdminBusinessTrips from "./pages/admin/AdminBusinessTrips";

const queryClient = new QueryClient();

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
              <Route path="business-trips" element={<AdminBusinessTrips />} />
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
