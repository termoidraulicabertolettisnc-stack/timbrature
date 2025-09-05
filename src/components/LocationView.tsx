import { MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReverseGeocoding } from '@/hooks/use-geocoding';

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

  // Generate OpenStreetMap URL for single location
  const getOpenStreetMapUrl = (lat: number, lng: number): string => {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  };

  // Generate OpenStreetMap URL for route planning
  const getRouteUrl = (startLat: number, startLng: number, endLat: number, endLng: number): string => {
    return `https://www.openstreetmap.org/directions?from=${startLat}%2C${startLng}&to=${endLat}%2C${endLng}&route=foot`;
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
              asChild
              className="h-7 px-2 text-xs"
            >
              <a 
                href={getOpenStreetMapUrl(startLat!, startLng!)} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Mappa
              </a>
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
              asChild
              className="h-7 px-2 text-xs"
            >
              <a 
                href={getOpenStreetMapUrl(endLat!, endLng!)} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Mappa
              </a>
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
            asChild
            className="w-full text-xs"
          >
            <a 
              href={getRouteUrl(startLat!, startLng!, endLat!, endLng!)} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Visualizza percorso in OpenStreetMap
            </a>
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