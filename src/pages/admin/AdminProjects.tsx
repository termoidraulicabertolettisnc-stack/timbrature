import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FolderKanban, Plus, Edit, Trash2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';

interface Project {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export default function AdminProjects() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);

    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle commesse",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingProject(null);
    setFormData({ name: '', description: '', is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      is_active: project.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Errore",
        description: "Il nome della commessa è obbligatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingProject) {
        // Update existing project
        const { error } = await supabase
          .from('projects')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            is_active: formData.is_active,
          })
          .eq('id', editingProject.id);

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Commessa aggiornata con successo",
        });
      } else {
        // Create new project - get company_id from current user
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (profileError) throw profileError;

        const { error } = await supabase
          .from('projects')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            is_active: formData.is_active,
            company_id: profileData.company_id,
          });

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Nuova commessa creata con successo",
        });
      }

      setDialogOpen(false);
      loadProjects();

    } catch (error) {
      console.error('Error saving project:', error);
      toast({
        title: "Errore",
        description: "Errore nel salvataggio della commessa",
        variant: "destructive",
      });
    }
  };

  const toggleProjectStatus = async (project: Project) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_active: !project.is_active })
        .eq('id', project.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: `Commessa ${!project.is_active ? 'attivata' : 'disattivata'} con successo`,
      });

      loadProjects();

    } catch (error) {
      console.error('Error updating project status:', error);
      toast({
        title: "Errore",
        description: "Errore nell'aggiornamento dello stato della commessa",
        variant: "destructive",
      });
    }
  };

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Gestione Commesse</h2>
          <p className="text-muted-foreground">
            Crea e gestisci le commesse aziendali per il tracking del tempo
          </p>
        </div>
        <Button onClick={openCreateDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nuova Commessa
        </Button>
      </div>

      {/* Search and filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Ricerca e Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Cerca per nome o descrizione..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={loadProjects}>
              Aggiorna
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Projects table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Commesse ({filteredProjects.length})
          </CardTitle>
          <CardDescription>
            Elenco di tutte le commesse aziendali
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <FolderKanban className="h-8 w-8 animate-pulse mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">Caricamento commesse...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Creata il</TableHead>
                    <TableHead>Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? 'Nessuna commessa trovata per la ricerca' : 'Nessuna commessa presente'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProjects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {project.description || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={project.is_active ? "default" : "secondary"}>
                            {project.is_active ? 'Attiva' : 'Inattiva'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(parseISO(project.created_at), 'dd/MM/yyyy', { locale: it })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(project)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleProjectStatus(project)}
                            >
                              {project.is_active ? (
                                <Trash2 className="h-4 w-4 text-destructive" />
                              ) : (
                                <Plus className="h-4 w-4 text-green-600" />
                              )}
                            </Button>
                          </div>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>
              {editingProject ? 'Modifica Commessa' : 'Nuova Commessa'}
            </DialogTitle>
            <DialogDescription>
              {editingProject 
                ? 'Modifica i dettagli della commessa selezionata' 
                : 'Inserisci i dettagli per creare una nuova commessa'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome della commessa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrizione dettagliata della commessa..."
                rows={3}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is_active">Commessa attiva</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave}>
              {editingProject ? 'Salva Modifiche' : 'Crea Commessa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}