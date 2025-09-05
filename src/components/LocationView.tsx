import { MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReverseGeocoding } from '@/hooks/use-geocoding';
import { useToast } from '@/components/ui/use-toast';

interface LocationViewProps {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  height?: string;
  className?: string;
}

const LocationView = ({ 
  startLat, 
  startLng, 
  endLat, 
  endLng, 
  height = "200px",
  className = "" 
}: LocationViewProps) => {
  const { toast } = useToast();
  const startAddress = useReverseGeocoding(startLat, startLng);
  const endAddress = useReverseGeocoding(endLat, endLng);

  // Robust coordinate validation
  const isValidCoordinate = (lat: number | null | undefined, lng: number | null | undefined): boolean => {
    return typeof lat === 'number' && typeof lng === 'number' && 
           !isNaN(lat) && !isNaN(lng) && 
           lat >= -90 && lat <= 90 && 
           lng >= -180 && lng <= 180;
  };

  const hasStartLocation = isValidCoordinate(startLat, startLng);
  const hasEndLocation = isValidCoordinate(endLat, endLng);
  const hasAnyLocation = hasStartLocation || hasEndLocation;

  const formatCoordinate = (value: number) => {
    return value.toFixed(6);
  };

  const openInGoogleMaps = (lat: number | null, lng: number | null, label: string) => {
    // Debug logging
    console.log('Aprendo Google Maps:', { lat, lng, label });
    
    // Validate coordinates before opening
    if (!isValidCoordinate(lat, lng)) {
      console.error('Coordinate non valide per Google Maps:', { lat, lng });
      toast({
        title: "Errore",
        description: "Coordinate GPS non valide per aprire Google Maps",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use more robust Google Maps URL format
      const url = `https://maps.google.com/?q=${lat},${lng}&ll=${lat},${lng}&z=16`;
      console.log('URL Google Maps:', url);
      
      const success = window.open(url, '_blank', 'noopener,noreferrer');
      if (!success) {
        throw new Error('Popup bloccato dal browser');
      }
    } catch (error) {
      console.error('Errore nell\'aprire Google Maps:', error);
      toast({
        title: "Errore",
        description: "Impossibile aprire Google Maps. Verifica le impostazioni del browser.",
        variant: "destructive"
      });
    }
  };

  if (!hasAnyLocation) {
    return (
      <div 
        className={`flex items-center justify-center bg-muted text-muted-foreground text-sm rounded-md ${className}`}
        style={{ height }}
      >
        Nessuna posizione GPS
      </div>
    );
  }

  return (
    <div 
      className={`bg-muted/50 rounded-md border p-4 space-y-3 ${className}`}
      style={{ minHeight: height }}
    >
      {/* Start Location */}
      {hasStartLocation && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-600">Entrata</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openInGoogleMaps(startLat, startLng, 'Entrata')}
              className="h-7 px-2 text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Maps
            </Button>
          </div>
          
          {startAddress.loading ? (
            <div className="text-sm text-muted-foreground">Caricamento indirizzo...</div>
          ) : startAddress.address ? (
            <div className="text-sm">{startAddress.address}</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {startAddress.error ? 'Indirizzo non disponibile' : 'Ricerca indirizzo...'}
            </div>
          )}
          
          <div className="font-mono text-xs text-muted-foreground">
            {formatCoordinate(startLat)}, {formatCoordinate(startLng)}
          </div>
        </div>
      )}

      {/* End Location */}
      {hasEndLocation && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-600" />
              <span className="font-medium text-red-600">Uscita</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openInGoogleMaps(endLat, endLng, 'Uscita')}
              className="h-7 px-2 text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Maps
            </Button>
          </div>
          
          {endAddress.loading ? (
            <div className="text-sm text-muted-foreground">Caricamento indirizzo...</div>
          ) : endAddress.address ? (
            <div className="text-sm">{endAddress.address}</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {endAddress.error ? 'Indirizzo non disponibile' : 'Ricerca indirizzo...'}
            </div>
          )}
          
          <div className="font-mono text-xs text-muted-foreground">
            {formatCoordinate(endLat)}, {formatCoordinate(endLng)}
          </div>
        </div>
      )}

      {/* Both locations - show route link */}
      {hasStartLocation && hasEndLocation && (
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.log('Aprendo percorso Google Maps:', { startLat, startLng, endLat, endLng });
              
              if (!isValidCoordinate(startLat, startLng) || !isValidCoordinate(endLat, endLng)) {
                toast({
                  title: "Errore",
                  description: "Coordinate GPS non valide per visualizzare il percorso",
                  variant: "destructive"
                });
                return;
              }
              
              try {
                const url = `https://maps.google.com/maps/dir/${startLat},${startLng}/${endLat},${endLng}`;
                console.log('URL percorso Google Maps:', url);
                
                const success = window.open(url, '_blank', 'noopener,noreferrer');
                if (!success) {
                  throw new Error('Popup bloccato dal browser');
                }
              } catch (error) {
                console.error('Errore nell\'aprire il percorso:', error);
                toast({
                  title: "Errore",
                  description: "Impossibile aprire il percorso in Google Maps",
                  variant: "destructive"
                });
              }
            }}
            className="w-full text-xs"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Visualizza percorso in Google Maps
          </Button>
        </div>
      )}

      {/* Missing location indicators */}
      {!hasStartLocation && hasEndLocation && (
        <div className="text-xs text-muted-foreground flex items-center">
          <MapPin className="h-3 w-3 mr-1" />
          Entrata senza GPS
        </div>
      )}
      
      {hasStartLocation && !hasEndLocation && (
        <div className="text-xs text-muted-foreground flex items-center">
          <MapPin className="h-3 w-3 mr-1" />
          Uscita senza GPS
        </div>
      )}
    </div>
  );
};

export default LocationView;