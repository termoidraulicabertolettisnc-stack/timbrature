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
import { Users, UserPlus, Edit, Trash2, Search, Shield, User, Settings, CreditCard } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { EmployeeSettingsDialog } from '@/components/EmployeeSettingsDialog';

interface Employee {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  codice_fiscale?: string; // AGGIUNTO
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
  codice_fiscale: string; // AGGIUNTO
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
    codice_fiscale: '', // AGGIUNTO
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
      // Prima creiamo l'utente con la funzione edge
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

      // Se il codice fiscale è stato fornito, aggiorniamolo
      if (formData.codice_fiscale) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ codice_fiscale: formData.codice_fiscale.toUpperCase() })
          .eq('email', formData.email);

        if (updateError) {
          console.error('Errore aggiornamento codice fiscale:', updateError);
        }
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
      const updateData: any = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        is_active: formData.is_active,
      };

      // Aggiungi codice fiscale solo se fornito
      if (formData.codice_fiscale) {
        updateData.codice_fiscale = formData.codice_fiscale.toUpperCase();
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
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
      codice_fiscale: employee.codice_fiscale || '', // AGGIUNTO
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
      codice_fiscale: '', // AGGIUNTO
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
      safe(employee.email).includes(safe(searchTerm)) ||
      safe(employee.codice_fiscale).includes(safe(searchTerm)); // AGGIUNTO
    
    const matchesRole = roleFilter === 'all' || employee.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && employee.is_active) ||
      (statusFilter === 'inactive' && !employee.is_active);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const activeEmployees = employees.filter(emp => emp.is_active).length;
  const adminEmployees = employees.filter(emp => emp.role === 'amministratore').length;

  // Formatta il codice fiscale per la visualizzazione
  const formatCodiceFiscale = (cf?: string) => {
    if (!cf) return '—';
    return cf.toUpperCase();
  };

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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Aggiungi Nuovo Dipendente</DialogTitle>
              <DialogDescription>
                Inserisci i dati del nuovo dipendente
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Nome *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Cognome *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codice_fiscale">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Codice Fiscale
                  </div>
                </Label>
                <Input
                  id="codice_fiscale"
                  value={formData.codice_fiscale}
                  onChange={(e) => setFormData(prev => ({ ...prev, codice_fiscale: e.target.value.toUpperCase() }))}
                  placeholder="Es: RSSMRA80A01H501Z"
                  maxLength={16}
                />
                <p className="text-xs text-muted-foreground">
                  Necessario per l'import Excel delle timbrature
                </p>
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
            <CardTitle className="text-sm font-medium">
              Dipendenti Totali
            </CardTitle>
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
            <CardTitle className="text-sm font-medium">
              Amministratori
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{adminEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Con accesso completo
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Dipendenti Standard
            </CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length - adminEmployees}</div>
            <p className="text-xs text-muted-foreground">
              Accesso limitato
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista Dipendenti</CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca per nome, email o CF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[300px]"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filtra ruolo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i ruoli</SelectItem>
                  <SelectItem value="dipendente">Dipendenti</SelectItem>
                  <SelectItem value="amministratore">Amministratori</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Inattivi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Codice Fiscale</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Creato il</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {formatCodiceFiscale(employee.codice_fiscale)}
                        </code>
                      </TableCell>
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
                        <div className="flex gap-2 justify-end">
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
        <DialogContent className="max-w-md">
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
              <Label htmlFor="edit_codice_fiscale">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Codice Fiscale
                </div>
              </Label>
              <Input
                id="edit_codice_fiscale"
                value={formData.codice_fiscale}
                onChange={(e) => setFormData(prev => ({ ...prev, codice_fiscale: e.target.value.toUpperCase() }))}
                placeholder="Es: RSSMRA80A01H501Z"
                maxLength={16}
              />
              <p className="text-xs text-muted-foreground">
                Necessario per l'import Excel delle timbrature
              </p>
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