import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Edit, MapPin, Trash2, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import AddressPicker from "@/components/AddressPicker";

interface Client {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  address: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ClientFormData {
  name: string;
  description?: string;
  is_active: boolean;
}

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [addressData, setAddressData] = useState<{
    address: string;
    formatted_address: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  const { toast } = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ClientFormData>();

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      // Get user's company_id first
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Utente non autenticato');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        throw new Error('Errore nel recupero del profilo utente');
      }

      if (!profile?.company_id) {
        toast({
          title: "Configurazione mancante",
          description: "Il tuo account non è associato a nessuna azienda. Contatta l'amministratore di sistema.",
          variant: "destructive",
        });
        setClients([]);
        return;
      }

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('name');

      if (error) {
        console.error('Clients fetch error:', error);
        throw new Error('Errore nel caricamento dei clienti');
      }
      
      setClients(data || []);
    } catch (error: any) {
      console.error('Error loading clients:', error);
      if (!error.message.includes('Configurazione mancante')) {
        toast({
          title: "Errore nel caricamento",
          description: error.message,
          variant: "destructive",
        });
      }
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.description && client.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openCreateDialog = () => {
    setEditingClient(null);
    setAddressData(null);
    reset({
      name: '',
      description: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    reset({
      name: client.name,
      description: client.description || '',
      is_active: client.is_active,
    });
    if (client.address || client.formatted_address) {
      setAddressData({
        address: client.address,
        formatted_address: client.formatted_address || '',
        latitude: client.latitude || 0,
        longitude: client.longitude || 0
      });
    } else {
      setAddressData(null);
    }
    setDialogOpen(true);
  };

  const handleSave = async (formData: ClientFormData) => {
    if (!addressData) {
      toast({
        title: "Errore",
        description: "Seleziona un indirizzo per il cliente",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get user's company_id
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        throw new Error('Utente non autenticato');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        throw new Error('Errore nel recupero del profilo utente');
      }

      if (!profile?.company_id) {
        toast({
          title: "Configurazione mancante",
          description: "Il tuo account non è associato a nessuna azienda. Impossibile salvare il cliente.",
          variant: "destructive",
        });
        return;
      }

      const clientData = {
        ...formData,
        company_id: profile.company_id,
        address: addressData.address,
        formatted_address: addressData.formatted_address,
        latitude: addressData.latitude,
        longitude: addressData.longitude,
      };

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id);

        if (error) {
          console.error('Update error:', error);
          throw new Error('Errore durante l\'aggiornamento del cliente');
        }

        toast({
          title: "Successo",
          description: "Cliente aggiornato con successo",
        });
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([clientData]);

        if (error) {
          console.error('Insert error:', error);
          throw new Error('Errore durante la creazione del cliente');
        }

        toast({
          title: "Successo",
          description: "Cliente creato con successo",
        });
      }

      setDialogOpen(false);
      setEditingClient(null);
      setAddressData(null);
      reset();
      loadClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      if (!error.message.includes('Configurazione mancante')) {
        toast({
          title: "Errore nel salvataggio",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const toggleClientStatus = async (client: Client) => {
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_active: !client.is_active })
        .eq('id', client.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: `Cliente ${!client.is_active ? 'attivato' : 'disattivato'} con successo`,
      });

      loadClients();
    } catch (error) {
      console.error('Error updating client status:', error);
      toast({
        title: "Errore",
        description: "Errore nell'aggiornamento dello stato del cliente",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (client: Client) => {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (error) throw error;

      toast({
        title: "Successo",
        description: "Cliente eliminato con successo",
      });

      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione del cliente",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestione Clienti</h1>
          <p className="text-muted-foreground">
            Gestisci i clienti e i loro indirizzi per il calcolo delle trasferte
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Cliente
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca clienti..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-lg font-medium">
                  {client.name}
                </CardTitle>
                <Badge variant={client.is_active ? "default" : "secondary"}>
                  {client.is_active ? "Attivo" : "Inattivo"}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditDialog(client)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sei sicuro di voler eliminare il cliente "{client.name}"?
                        Questa azione non può essere annullata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(client)}>
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {client.description && (
                  <CardDescription>{client.description}</CardDescription>
                )}
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-2" />
                  {client.formatted_address || client.address}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Creato: {new Date(client.created_at).toLocaleDateString('it-IT')}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleClientStatus(client)}
                  >
                    {client.is_active ? 'Disattiva' : 'Attiva'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente registrato'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? 'Prova a modificare i termini di ricerca'
                : 'Inizia creando il primo cliente'
              }
            </p>
            {!searchTerm && (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Crea Cliente
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? 'Modifica Cliente' : 'Nuovo Cliente'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome Cliente</Label>
              <Input
                id="name"
                {...register('name', { required: 'Il nome è obbligatorio' })}
                placeholder="Nome del cliente"
              />
              {errors.name && (
                <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Descrizione</Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Descrizione del cliente (opzionale)"
                rows={3}
              />
            </div>

            <div>
              <Label>Indirizzo</Label>
              <AddressPicker
                value={addressData?.address || ''}
                onAddressSelect={setAddressData}
                placeholder="Cerca l'indirizzo del cliente..."
              />
              {!addressData && (
                <p className="text-xs text-destructive mt-1">
                  L'indirizzo è obbligatorio per calcolare le distanze delle trasferte
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                {...register('is_active')}
              />
              <Label htmlFor="is_active">Cliente attivo</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={!addressData}>
                {editingClient ? 'Aggiorna' : 'Crea'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}