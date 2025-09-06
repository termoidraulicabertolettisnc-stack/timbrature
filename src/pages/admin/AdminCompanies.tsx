import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building, Edit, MapPin, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import AddressPicker from "@/components/AddressPicker";

interface Company {
  id: string;
  name: string;
  address?: string;
  city: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
}

interface CompanyFormData {
  name: string;
  address?: string;
  city: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addressData, setAddressData] = useState<{
    address: string;
    formatted_address: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  const { toast } = useToast();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CompanyFormData>();

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast({
        title: "Errore",
        description: "Errore nel caricamento delle aziende",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: CompanyFormData) => {
    try {
      const submitData = {
        ...data,
        ...addressData
      };

      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(submitData)
          .eq('id', editingCompany.id);

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Azienda aggiornata con successo",
        });
      } else {
        const { error } = await supabase
          .from('companies')
          .insert([submitData]);

        if (error) throw error;

        toast({
          title: "Successo",
          description: "Azienda creata con successo",
        });
      }

      setDialogOpen(false);
      setEditingCompany(null);
      setAddressData(null);
      reset();
      loadCompanies();
    } catch (error) {
      console.error('Error saving company:', error);
      toast({
        title: "Errore",
        description: "Errore nel salvataggio dell'azienda",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (company: Company) => {
    setEditingCompany(company);
    reset({
      name: company.name,
      city: company.city,
    });
    if (company.address || company.formatted_address) {
      setAddressData({
        address: company.address || '',
        formatted_address: company.formatted_address || '',
        latitude: company.latitude || 0,
        longitude: company.longitude || 0
      });
    }
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCompany(null);
    setAddressData(null);
    reset({
      name: '',
      city: 'Cremona',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (company: Company) => {
    try {
      console.log('Attempting to delete company:', company);
      
      const { data, error } = await supabase
        .from('companies')
        .delete()
        .eq('id', company.id)
        .select(); // Aggiunge select per vedere se qualcosa viene eliminato

      console.log('Delete result:', { data, error });

      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('No rows were deleted - likely RLS policy issue');
        toast({
          title: "Errore",
          description: "Non hai i permessi per eliminare questa azienda",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Successo",
        description: "Azienda eliminata con successo",
      });

      loadCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione dell'azienda",
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
          <h1 className="text-3xl font-bold">Gestione Aziende</h1>
          <p className="text-muted-foreground">
            Gestisci le aziende registrate nel sistema
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Azienda
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? 'Modifica Azienda' : 'Nuova Azienda'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome Azienda</Label>
                <Input
                  id="name"
                  {...register('name', { required: 'Il nome è obbligatorio' })}
                  placeholder="Nome dell'azienda"
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="address">Indirizzo</Label>
                <AddressPicker
                  value={addressData?.address || ''}
                  onAddressSelect={setAddressData}
                  placeholder="Cerca l'indirizzo dell'azienda..."
                />
                {addressData?.formatted_address && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {addressData.formatted_address}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="city">Città</Label>
                <Input
                  id="city"
                  {...register('city', { required: 'La città è obbligatoria' })}
                  placeholder="Città"
                />
                {errors.city && (
                  <p className="text-sm text-destructive mt-1">{errors.city.message}</p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Annulla
                </Button>
                <Button type="submit">
                  {editingCompany ? 'Aggiorna' : 'Crea'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {companies.map((company) => (
          <Card key={company.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">
                <Building className="h-5 w-5 inline mr-2" />
                {company.name}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(company)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sei sicuro di voler eliminare l'azienda "{company.name}"? 
                        Questa azione non può essere annullata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(company)}>
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(company.formatted_address || company.address) && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-2" />
                    {company.formatted_address || company.address}
                  </div>
                )}
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-2" />
                  {company.city}
                </div>
                <div className="text-xs text-muted-foreground">
                  Creata il: {new Date(company.created_at).toLocaleDateString('it-IT')}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {companies.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessuna azienda trovata</h3>
            <p className="text-muted-foreground mb-4">
              Inizia creando la prima azienda
            </p>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Crea Azienda
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}