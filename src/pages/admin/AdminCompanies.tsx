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
import AddressPicker, { AddressData } from "@/components/AddressPicker";

interface Company {
  id: string;
  name: string;
  address?: string;
  formatted_address?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  province?: string;
  country?: string;
  created_at: string;
  updated_at: string;
}

interface CompanyFormData {
  name: string;
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addressData, setAddressData] = useState<AddressData | null>(null);
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
      const submitData: any = {
        name: data.name,
      };

      // Add address data if available
      if (addressData) {
        submitData.address = addressData.address;
        submitData.formatted_address = addressData.formatted_address;
        submitData.latitude = addressData.latitude;
        submitData.longitude = addressData.longitude;
        submitData.city = addressData.city;
        submitData.province = addressData.province;
        submitData.country = addressData.country;
      }

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
        // Crea la nuova azienda
        const { data: newCompany, error } = await supabase
          .from('companies')
          .insert([submitData])
          .select()
          .single();

        if (error) throw error;

        // Crea automaticamente le configurazioni di default per la nuova azienda
        const defaultSettings = {
          company_id: newCompany.id,
          standard_weekly_hours: { lun: 8, mar: 8, mer: 8, gio: 8, ven: 8, sab: 0, dom: 0 },
          lunch_break_type: '60_minuti' as const,
          lunch_break_min_hours: 6.0,
          saturday_handling: 'trasferta' as const,
          meal_voucher_policy: 'oltre_6_ore' as const,
          night_shift_start: '20:00:00',
          night_shift_end: '05:00:00',
          overtime_monthly_compensation: false,
          business_trip_rate_with_meal: 30.98,
          business_trip_rate_without_meal: 46.48,
          saturday_hourly_rate: 10.00,
          meal_voucher_amount: 8.00,
          daily_allowance_amount: 10.00,
          daily_allowance_policy: 'disabled' as const,
          daily_allowance_min_hours: 6,
          meal_voucher_min_hours: 6,
          enable_entry_tolerance: false,
          standard_start_time: '08:00:00',
          entry_tolerance_minutes: 10,
          enable_overtime_conversion: false,
          default_overtime_conversion_rate: 12.00,
        };

        const { error: settingsError } = await supabase
          .from('company_settings')
          .insert([defaultSettings]);

        if (settingsError) {
          console.error('Error creating default settings:', settingsError);
          toast({
            title: "Attenzione",
            description: "Azienda creata, ma le configurazioni di default non sono state create. Vai nelle impostazioni per configurarle.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Successo",
            description: "Azienda e configurazioni create con successo",
          });
        }
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
    });
    if (company.address || company.formatted_address) {
      setAddressData({
        address: company.address || '',
        formatted_address: company.formatted_address || '',
        latitude: company.latitude || 0,
        longitude: company.longitude || 0,
        city: company.city,
        province: company.province,
        country: company.country
      });
    } else {
      setAddressData(null);
    }
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCompany(null);
    setAddressData(null);
    reset({
      name: '',
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
        .select();

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestione Aziende</h1>
          <p className="text-muted-foreground">
            Gestisci le aziende registrate nel sistema
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew} className="flex-shrink-0" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Nuova Azienda</span>
              <span className="sm:hidden">Nuova</span>
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
                <Label htmlFor="address">Indirizzo Sede</Label>
                <AddressPicker
                  value={addressData?.formatted_address || ''}
                  onAddressSelect={setAddressData}
                  placeholder="Cerca l'indirizzo della sede..."
                />
                {addressData?.city && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Città: {addressData.city}{addressData.province ? ` (${addressData.province})` : ''}
                  </p>
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
                  <div className="flex items-start text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                    <div>
                      <div>{company.formatted_address || company.address}</div>
                      {company.city && (
                        <div className="text-xs">
                          {company.city}{company.province ? ` (${company.province})` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
