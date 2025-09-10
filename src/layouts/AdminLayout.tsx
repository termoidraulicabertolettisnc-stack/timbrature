import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

export const AdminLayout = () => {
  const { signOut, user } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold text-foreground truncate">TimeTracker Admin</h1>
            </div>
            
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm text-muted-foreground hidden sm:inline truncate">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={signOut} className="flex-shrink-0">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline sm:ml-2">Logout</span>
              </Button>
            </div>
          </header>
          
          <main className="flex-1 p-4 bg-muted/20">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};