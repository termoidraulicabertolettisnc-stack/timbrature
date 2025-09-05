import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LocationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const LocationModal = ({ open, onOpenChange }: LocationModalProps) => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const getCurrentLocation = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocalizzazione non supportata dal browser');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { 
            enableHighAccuracy: true, 
            timeout: 10000, 
            maximumAge: 60000 
          }
        );
      });

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    } catch (err: any) {
      let errorMessage = 'Errore nella geolocalizzazione';
      
      switch (err.code) {
        case 1:
          errorMessage = 'Permesso di geolocalizzazione negato';
          break;
        case 2:
          errorMessage = 'Posizione non disponibile';
          break;
        case 3:
          errorMessage = 'Timeout nella richiesta di posizione';
          break;
      }
      
      setError(errorMessage);
      toast({
        title: "Errore GPS",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openInGoogleMaps = () => {
    if (location) {
      const url = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
      window.open(url, '_blank');
    }
  };

  const copyCoordinates = async () => {
    if (location) {
      const coordinates = `${location.latitude}, ${location.longitude}`;
      try {
        await navigator.clipboard.writeText(coordinates);
        toast({
          title: "Coordinate copiate!",
          description: "Le coordinate sono state copiate negli appunti",
        });
      } catch (err) {
        toast({
          title: "Errore",
          description: "Impossibile copiare le coordinate",
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => {
    if (open && !location) {
      getCurrentLocation();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Posizione Attuale
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Rilevamento posizione GPS...
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="text-sm text-destructive font-medium">
                {error}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2" 
                onClick={getCurrentLocation}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Riprova
              </Button>
            </div>
          )}
          
          {location && (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latitudine:</span>
                    <span className="font-mono">{location.latitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Longitudine:</span>
                    <span className="font-mono">{location.longitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Precisione:</span>
                    <span>{Math.round(location.accuracy)}m</span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={openInGoogleMaps}
                  variant="default"
                  className="flex-1"
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Apri in Maps
                </Button>
                <Button 
                  onClick={copyCoordinates}
                  variant="outline"
                  className="flex-1"
                >
                  Copia Coordinate
                </Button>
              </div>
              
              <Button 
                onClick={getCurrentLocation}
                variant="outline"
                className="w-full"
                disabled={isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Aggiorna Posizione
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationModal;