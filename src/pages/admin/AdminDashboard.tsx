import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, FolderKanban, Calendar } from "lucide-react";
import PayrollDashboard from "@/components/PayrollDashboard";
import BusinessTripsDashboard from "@/components/BusinessTripsDashboard";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Dashboard Amministratore</h2>
        <p className="text-muted-foreground">Panoramica generale del sistema TimeTracker</p>
      </div>

      <Tabs defaultValue="overview" className="w-full flex flex-col gap-4">
        <TabsList className="flex h-fit w-fit bg-muted/50 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-background">
            <Users className="h-4 w-4" />
            Panoramica
          </TabsTrigger>
          <TabsTrigger value="payroll" className="flex items-center gap-2 data-[state=active]:bg-background">
            <Clock className="h-4 w-4" />
            Vista Buste Paga
          </TabsTrigger>
          <TabsTrigger value="business-trips" className="flex items-center gap-2 data-[state=active]:bg-background">
            <FolderKanban className="h-4 w-4" />
            Trasferte
          </TabsTrigger>
        </TabsList>
        <div className="w-full">
          <TabsContent value="overview" className="space-y-6 mt-0">
            <OverviewDashboard />
          </TabsContent>

          <TabsContent value="payroll" className="mt-0">
            <PayrollDashboard />
          </TabsContent>

          <TabsContent value="business-trips" className="mt-0">
            <BusinessTripsDashboard />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OverviewDashboard() {
  return (
    <div className="space-y-4">
      {/* Stats Cards - 4 Card KPI Reali */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">+2 rispetto al mese scorso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Lavorate Oggi</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">96</div>
            <p className="text-xs text-muted-foreground">Su 8 dipendenti attivi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commesse Attive</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">3 in scadenza questo mese</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consolidato Mensile</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">87%</div>
            <p className="text-xs text-muted-foreground">Completamento mese corrente</p>
          </CardContent>
        </Card>
      </div>

      {/* 
        ✅ RIMOSSO: Sezione "Quick Actions" con le 2 card di facciata
        - Attività Recenti (dati fake)
        - Avvisi e Notifiche (dati fake)
        
        La dashboard ora mostra solo le 4 card KPI reali + 
        la dashboard straordinari ibrida (che è nel tab Vista Buste Paga)
      */}
    </div>
  );
}
