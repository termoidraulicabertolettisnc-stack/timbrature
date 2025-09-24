'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Users, UserPlus, Edit, Trash2, Search, Shield, User, Settings } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { EmployeeSettingsDialog } from '@/components/EmployeeSettingsDialog';

interface Employee {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'dipendente' | 'amministratore';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  company_id: string | null;
}

interface EmployeeFormData {
  email: string;
  first_name: string;
  last_name: string;
  role: 'dipendente' | 'amministratore';
  is_active: boolean;
}

export default function AdminEmployees() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [settingsEmployee, setSettingsEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    email: '',
    first_name: '',
    last_name: '',
    role: 'dipendente',
    is_active: true,
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      // Get current user's company first
      const { data: me, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (profileError || !me?.company_id) {
        throw new Error('Impossibile determinare l\'azienda di appartenenza');
      }

      // Load only employees from the same company
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', me.company_id)
        .order('first_name');

      if (error) throw error;
      setEmployees(data || []);

    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento dei dipendenti",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!formData.email || !formData.first_name || !formData.last_name) {
      toast({
        title: "Errore",
        description: "Compila tutti i campi obbligatori",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call secure edge function to create employee
      const response = await supabase.functions.invoke('create-employee', {
        body: {
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          is_active: formData.is_active
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Errore sconosciuto');
      }

      toast({
        title: "Successo",
        description: result.message || "Dipendente creato con successo. È stata inviata un'email di invito.",
      });

      setIsAddDialogOpen(false);
      resetForm();
      loadEmployees();

    } catch (error) {
      console.error('Error adding employee:', error);
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Errore nell'aggiunta del dipendente",
        variant: "destructive",
      });
    }
  };

  const handleEditEmployee = async () => {
    if (!selectedEmployee) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          is_active: formData.is_active,
        })
        .eq('user_id', selectedEmployee.user_id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Dipendente aggiornato con successo",
      });

      setIsEditDialogOpen(false);
      resetForm();
      loadEmployees();

    } catch (error) {
      console.error('Error updating employee:', error);
      toast({
        title: "Errore",
        description: "Errore nell'aggiornamento del dipendente",
        variant: "destructive",
      });
    }
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Sei sicuro di voler eliminare completamente ${employee.first_name} ${employee.last_name}? Questa azione non può essere annullata.`)) {
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('delete-employee', {
        body: { email: employee.email }
      });

      if (error) {
        console.error('Error deleting employee:', error);
        toast({
          title: "Errore",
          description: "Errore nell'eliminazione del dipendente",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Successo",
        description: "Dipendente eliminato con successo",
      });

      loadEmployees();

    } catch (error) {
      console.error('Error deleting employee:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione del dipendente",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setFormData({
      email: employee.email,
      first_name: employee.first_name,
      last_name: employee.last_name,
      role: employee.role,
      is_active: employee.is_active,
    });
    setIsEditDialogOpen(true);
  };

  const openSettingsDialog = (employee: Employee) => {
    setSettingsEmployee(employee);
    setIsSettingsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      email: '',
      first_name: '',
      last_name: '',
      role: 'dipendente',
      is_active: true,
    });
    setSelectedEmployee(null);
  };

  const filteredEmployees = employees.filter(employee => {
    const safe = (v?: string) => (v ?? '').toLowerCase();
    const matchesSearch = 
      safe(employee.first_name).includes(safe(searchTerm)) ||
      safe(employee.last_name).includes(safe(searchTerm)) ||
      safe(employee.email).includes(safe(searchTerm));
    
    const matchesRole = roleFilter === 'all' || employee.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && employee.is_active) ||
      (statusFilter === 'inactive' && !employee.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const activeEmployees = employees.filter(emp => emp.is_active).length;
  const adminEmployees = employees.filter(emp => emp.role === 'amministratore').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Dipendenti</h2>
          <p className="text-muted-foreground">
            Gestisci utenti, ruoli e permessi dell'azienda
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Aggiungi Dipendente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiungi Nuovo Dipendente</DialogTitle>
              <DialogDescription>
                Inserisci i dati del nuovo dipendente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Nome</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Cognome</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Ruolo</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dipendente">Dipendente</SelectItem>
                    <SelectItem value="amministratore">Amministratore</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="is_active">Attivo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleAddEmployee}>
                Aggiungi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Totali</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeEmployees} attivi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amministratori</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Con permessi admin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dipendenti Standard</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length - adminEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Ruolo dipendente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtri e Ricerca
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Ricerca</Label>
              <Input
                placeholder="Nome, cognome o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i ruoli</SelectItem>
                  <SelectItem value="dipendente">Dipendenti</SelectItem>
                  <SelectItem value="amministratore">Amministratori</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Inattivi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={loadEmployees} className="w-full">
                Aggiorna
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabella Dipendenti */}
      <Card>
        <CardHeader>
          <CardTitle>Elenco Dipendenti ({filteredEmployees.length})</CardTitle>
          <CardDescription>
            Gestisci i dipendenti della tua azienda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data Creazione</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Caricamento dipendenti...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nessun dipendente trovato
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.user_id}>
                      <TableCell className="font-medium">
                        {employee.first_name} {employee.last_name}
                      </TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>
                        <Badge variant={employee.role === 'amministratore' ? 'default' : 'secondary'}>
                          {employee.role === 'amministratore' ? 'Admin' : 'Dipendente'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.is_active ? 'default' : 'destructive'}>
                          {employee.is_active ? 'Attivo' : 'Inattivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {employee.created_at
                          ? format(parseISO(employee.created_at), 'dd/MM/yyyy', { locale: it })
                          : '—'}
                      </TableCell>
                       <TableCell>
                         <div className="flex gap-2">
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => openSettingsDialog(employee)}
                             title={`Configura impostazioni per ${employee.first_name} ${employee.last_name}`}
                           >
                             <Settings className="h-4 w-4" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => openEditDialog(employee)}
                           >
                             <Edit className="h-4 w-4" />
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => handleDeleteEmployee(employee)}
                             className="text-destructive hover:text-destructive"
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
                         </div>
                       </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Modifica Dipendente */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Dipendente</DialogTitle>
            <DialogDescription>
              Aggiorna i dati del dipendente selezionato
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_first_name">Nome</Label>
                <Input
                  id="edit_first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_last_name">Cognome</Label>
                <Input
                  id="edit_last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={formData.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">L'email non può essere modificata</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_role">Ruolo</Label>
              <Select value={formData.role} onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dipendente">Dipendente</SelectItem>
                  <SelectItem value="amministratore">Amministratore</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit_is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="edit_is_active">Attivo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleEditEmployee}>
              Salva Modifiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Impostazioni Dipendente */}
      {settingsEmployee && (
        <EmployeeSettingsDialog
          employee={{
            id: settingsEmployee.user_id,
            first_name: settingsEmployee.first_name,
            last_name: settingsEmployee.last_name,
            email: settingsEmployee.email,
            company_id: settingsEmployee.company_id || '',
          }}
          open={isSettingsDialogOpen}
          onOpenChange={setIsSettingsDialogOpen}
          onEmployeeUpdate={loadEmployees}
        />
      )}
    </div>
  );
}