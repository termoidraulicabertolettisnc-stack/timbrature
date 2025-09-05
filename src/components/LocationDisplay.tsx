import { MapPin, Navigation } from 'lucide-react';
import LocationView from '@/components/LocationView';

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
    // Compact view with simplified location display
    return (
      <LocationView
        startLat={startLat}
        startLng={startLng}
        endLat={endLat}
        endLng={endLng}
        height="120px"
        className="w-full"
      />
    );
  }

  return (
    <LocationView
      startLat={startLat}
      startLng={startLng}
      endLat={endLat}
      endLng={endLng}
      height="200px"
      className="w-full"
    />
  );
};

export default LocationDisplay;