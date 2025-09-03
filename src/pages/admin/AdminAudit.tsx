import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Search, Filter, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: any;
  new_values: any;
  changed_by: string;
  changed_at: string;
  user_name?: string;
}

interface AuditStats {
  total_logs: number;
  today_logs: number;
  insert_count: number;
  update_count: number;
  delete_count: number;
}

export default function AdminAudit() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats>({
    total_logs: 0,
    today_logs: 0,
    insert_count: 0,
    update_count: 0,
    delete_count: 0,
  });

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const [users, setUsers] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadAuditLogs();
  }, [tableFilter, actionFilter, userFilter, dateFilter]);

  const loadInitialData = async () => {
    try {
      // Load users for filter
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .order('first_name');

      if (usersError) throw usersError;
      setUsers(usersData || []);

      await loadAuditLogs();

    } catch (error) {
      console.error('Error loading initial data:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dati iniziali",
        variant: "destructive",
      });
    }
  };

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(100);

      // Apply filters
      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (userFilter !== 'all') {
        query = query.eq('changed_by', userFilter);
      }

      // Date filter
      const startOfDay = `${dateFilter}T00:00:00.000Z`;
      const endOfDay = `${dateFilter}T23:59:59.999Z`;
      query = query.gte('changed_at', startOfDay).lte('changed_at', endOfDay);

      const { data: logsData, error: logsError } = await query;
      if (logsError) throw logsError;

      // Enrich logs with user names
      const enrichedLogs = (logsData || []).map(log => {
        const user = users.find(u => u.user_id === log.changed_by);
        return {
          ...log,
          user_name: user ? `${user.first_name} ${user.last_name}` : 'Sistema',
        };
      });

      setAuditLogs(enrichedLogs);

      // Calculate stats
      calculateStats(enrichedLogs);

    } catch (error) {
      console.error('Error loading audit logs:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei log di audit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (logs: AuditLog[]) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayLogs = logs.filter(log => 
      format(parseISO(log.changed_at), 'yyyy-MM-dd') === today
    );

    setStats({
      total_logs: logs.length,
      today_logs: todayLogs.length,
      insert_count: logs.filter(log => log.action === 'INSERT').length,
      update_count: logs.filter(log => log.action === 'UPDATE').length,
      delete_count: logs.filter(log => log.action === 'DELETE').length,
    });
  };

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case 'INSERT': return 'default';
      case 'UPDATE': return 'secondary';
      case 'DELETE': return 'destructive';
      default: return 'outline';
    }
  };

  const getTableDisplayName = (tableName: string) => {
    const tableNames: Record<string, string> = {
      'timesheets': 'Timesheets',
      'profiles': 'Profili Dipendenti',
      'projects': 'Commesse',
      'company_settings': 'Configurazioni',
      'employee_settings': 'Impostazioni Dipendenti',
    };
    return tableNames[tableName] || tableName;
  };

  const showLogDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  const filteredLogs = auditLogs.filter(log => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.table_name.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      (log.user_name && log.user_name.toLowerCase().includes(searchLower)) ||
      log.record_id.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Audit Log</h2>
          <p className="text-muted-foreground">
            Tracciamento di tutte le modifiche ai dati del sistema
          </p>
        </div>
        <Button onClick={loadAuditLogs} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Log Totali</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_logs}</div>
            <p className="text-xs text-muted-foreground">Nel periodo selezionato</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oggi</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today_logs}</div>
            <p className="text-xs text-muted-foreground">Attività di oggi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inserimenti</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.insert_count}</div>
            <p className="text-xs text-muted-foreground">Nuovi record</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modifiche</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.update_count}</div>
            <p className="text-xs text-muted-foreground">Record aggiornati</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eliminazioni</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.delete_count}</div>
            <p className="text-xs text-muted-foreground">Record eliminati</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data</label>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tabella</label>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le tabelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le tabelle</SelectItem>
                  <SelectItem value="timesheets">Timesheets</SelectItem>
                  <SelectItem value="profiles">Profili</SelectItem>
                  <SelectItem value="projects">Commesse</SelectItem>
                  <SelectItem value="company_settings">Configurazioni</SelectItem>
                  <SelectItem value="employee_settings">Impostazioni Dipendenti</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Azione</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le azioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le azioni</SelectItem>
                  <SelectItem value="INSERT">Inserimento</SelectItem>
                  <SelectItem value="UPDATE">Modifica</SelectItem>
                  <SelectItem value="DELETE">Eliminazione</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Utente</label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutti gli utenti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli utenti</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.first_name} {user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ricerca</label>
              <Input
                placeholder="Cerca nei log..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button variant="outline" onClick={loadAuditLogs} className="w-full">
                <Search className="h-4 w-4 mr-2" />
                Cerca
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Log Attività ({filteredLogs.length})
          </CardTitle>
          <CardDescription>
            Cronologia delle modifiche effettuate nel sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <FileText className="h-8 w-8 animate-pulse mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Caricamento log...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Ora</TableHead>
                    <TableHead>Utente</TableHead>
                    <TableHead>Tabella</TableHead>
                    <TableHead>Azione</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead>Dettagli</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nessun log trovato per i filtri selezionati
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {format(parseISO(log.changed_at), 'dd/MM/yyyy HH:mm:ss', { locale: it })}
                        </TableCell>
                        <TableCell>{log.user_name}</TableCell>
                        <TableCell>{getTableDisplayName(log.table_name)}</TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action)}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.record_id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => showLogDetails(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal would go here - simplified for brevity */}
      {detailsOpen && selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Dettagli Log Audit</CardTitle>
              <CardDescription>
                {getTableDisplayName(selectedLog.table_name)} - {selectedLog.action}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <div className="text-sm">
                  <strong>Data/Ora:</strong> {format(parseISO(selectedLog.changed_at), 'dd/MM/yyyy HH:mm:ss', { locale: it })}
                </div>
                <div className="text-sm">
                  <strong>Utente:</strong> {selectedLog.user_name}
                </div>
                <div className="text-sm">
                  <strong>Record ID:</strong> {selectedLog.record_id}
                </div>
              </div>

              {selectedLog.old_values && (
                <div>
                  <h4 className="font-medium mb-2">Valori Precedenti:</h4>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <h4 className="font-medium mb-2">Nuovi Valori:</h4>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setDetailsOpen(false)}>Chiudi</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}