import { MapPin, Navigation } from 'lucide-react';
import MapView from '@/components/MapView';

interface LocationDisplayProps {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  compact?: boolean;
}

const LocationDisplay = ({ startLat, startLng, endLat, endLng, compact = false }: LocationDisplayProps) => {
  const hasStartLocation = startLat && startLng;
  const hasEndLocation = endLat && endLng;

  const formatCoordinate = (value: number) => {
    return value.toFixed(6);
  };

  if (!hasStartLocation && !hasEndLocation) {
    return (
      <div className="text-xs text-muted-foreground">
        Nessuna posizione
      </div>
    );
  }

  if (compact) {
    // Compact view with small map and coordinates
    return (
      <div className="space-y-2">
        <MapView
          startLat={startLat}
          startLng={startLng}
          endLat={endLat}
          endLng={endLng}
          height="80px"
          className="w-full"
        />
        
        <div className="flex flex-col gap-1">
          {hasStartLocation && (
            <div className="flex items-center gap-1 text-xs">
              <Navigation className="h-3 w-3 text-green-600" />
              <span className="font-mono text-xs">
                {formatCoordinate(startLat)}, {formatCoordinate(startLng)}
              </span>
            </div>
          )}
          
          {hasEndLocation && (
            <div className="flex items-center gap-1 text-xs">
              <Navigation className="h-3 w-3 text-red-600" />
              <span className="font-mono text-xs">
                {formatCoordinate(endLat)}, {formatCoordinate(endLng)}
              </span>
            </div>
          )}
          
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
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Interactive Map */}
      <MapView
        startLat={startLat}
        startLng={startLng}
        endLat={endLat}
        endLng={endLng}
        height="200px"
        className="w-full"
      />
      
      {/* Coordinates display */}
      <div className="flex flex-col gap-1">
        {hasStartLocation && (
          <div className="flex items-center gap-2 text-xs">
            <Navigation className="h-3 w-3 text-green-600" />
            <div>
              <div className="font-medium text-green-600">Entrata</div>
              <div className="font-mono text-xs">
                {formatCoordinate(startLat)}, {formatCoordinate(startLng)}
              </div>
            </div>
          </div>
        )}
        
        {hasEndLocation && (
          <div className="flex items-center gap-2 text-xs">
            <Navigation className="h-3 w-3 text-red-600" />
            <div>
              <div className="font-medium text-red-600">Uscita</div>
              <div className="font-mono text-xs">
                {formatCoordinate(endLat)}, {formatCoordinate(endLng)}
              </div>
            </div>
          </div>
        )}
        
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
    </div>
  );
};

export default LocationDisplay;