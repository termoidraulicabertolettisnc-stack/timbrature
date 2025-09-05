import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

  const openLocationInMaps = (lat: number, lng: number, label: string) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}&t=m&z=16`;
    window.open(url, '_blank');
  };

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
    // Compact view with just coordinates and external link
    return (
      <div className="flex flex-col gap-1">
        {hasStartLocation && (
          <div className="flex items-center gap-1 text-xs">
            <Navigation className="h-3 w-3 text-green-600" />
            <span className="font-mono text-xs">
              {formatCoordinate(startLat)}, {formatCoordinate(startLng)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => openLocationInMaps(startLat, startLng, 'Entrata')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        )}
        
        {hasEndLocation && (
          <div className="flex items-center gap-1 text-xs">
            <Navigation className="h-3 w-3 text-red-600" />
            <span className="font-mono text-xs">
              {formatCoordinate(endLat)}, {formatCoordinate(endLng)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => openLocationInMaps(endLat, endLng, 'Uscita')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
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
        height="150px"
        className="w-full"
      />
      
      {/* Coordinates with external links */}
      <div className="flex flex-col gap-1">
        {hasStartLocation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 justify-start text-xs"
                  onClick={() => openLocationInMaps(startLat, startLng, 'Entrata')}
                >
                  <Navigation className="h-3 w-3 mr-1 text-green-600" />
                  <span className="font-mono">
                    {formatCoordinate(startLat)}, {formatCoordinate(startLng)}
                  </span>
                  <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-medium">Posizione Entrata</div>
                  <div>Latitudine: {formatCoordinate(startLat)}</div>
                  <div>Longitudine: {formatCoordinate(startLng)}</div>
                  <div className="mt-1 text-muted-foreground">Clicca per aprire in Google Maps</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {hasEndLocation && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 justify-start text-xs"
                  onClick={() => openLocationInMaps(endLat, endLng, 'Uscita')}
                >
                  <Navigation className="h-3 w-3 mr-1 text-red-600" />
                  <span className="font-mono">
                    {formatCoordinate(endLat)}, {formatCoordinate(endLng)}
                  </span>
                  <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-medium">Posizione Uscita</div>
                  <div>Latitudine: {formatCoordinate(endLat)}</div>
                  <div>Longitudine: {formatCoordinate(endLng)}</div>
                  <div className="mt-1 text-muted-foreground">Clicca per aprire in Google Maps</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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