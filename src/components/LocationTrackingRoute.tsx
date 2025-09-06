import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Navigation, Clock, AlertTriangle } from 'lucide-react';
import { useReverseGeocoding } from '@/hooks/use-geocoding';
import { Skeleton } from '@/components/ui/skeleton';

interface LocationPing {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
  movement_detected: boolean;
  ping_interval_used: number;
}

interface LocationTrackingRouteProps {
  timesheetId: string;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
}

const LocationTrackingRoute = ({ 
  timesheetId, 
  startLat, 
  startLng, 
  endLat, 
  endLng 
}: LocationTrackingRouteProps) => {
  const [pings, setPings] = useState<LocationPing[]>([]);
  const [loading, setLoading] = useState(true);
  const [significantMovements, setSignificantMovements] = useState<LocationPing[]>([]);

  useEffect(() => {
    loadLocationPings();
  }, [timesheetId]);

  const loadLocationPings = async () => {
    try {
      const { data, error } = await supabase
        .from('location_pings')
        .select('*')
        .eq('timesheet_id', timesheetId)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      setPings(data || []);
      
      // Filter for significant movements (only those with movement_detected = true)
      const movements = (data || []).filter(ping => ping.movement_detected);
      setSignificantMovements(movements);
      
    } catch (error) {
      console.error('Error loading location pings:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalDistance = () => {
    if (pings.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < pings.length; i++) {
      const prev = pings[i - 1];
      const curr = pings[i];
      totalDistance += calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return totalDistance;
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Tracciamento Percorso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Tracciamento Percorso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>Nessun dato di tracciamento disponibile</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDistance = calculateTotalDistance();
  const movementCount = significantMovements.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Tracciamento Percorso
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{pings.length}</div>
            <div className="text-xs text-muted-foreground">Ping totali</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{movementCount}</div>
            <div className="text-xs text-muted-foreground">Movimenti</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{formatDistance(totalDistance)}</div>
            <div className="text-xs text-muted-foreground">Distanza</div>
          </div>
        </div>

        {/* Significant movements only */}
        {significantMovements.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Spostamenti Significativi</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {significantMovements.map((ping, index) => (
                <MovementItem
                  key={ping.id}
                  ping={ping}
                  index={index}
                  total={significantMovements.length}
                />
              ))}
            </div>
          </div>
        )}

        {/* Start/End locations if available */}
        {(startLat && startLng) || (endLat && endLng) ? (
          <div className="space-y-2 border-t pt-4">
            <h4 className="font-medium text-sm">Posizioni Entrata/Uscita</h4>
            <div className="space-y-2">
              {startLat && startLng && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium">Entrata:</span>
                  <LocationAddress lat={startLat} lng={startLng} />
                </div>
              )}
              {endLat && endLng && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="font-medium">Uscita:</span>
                  <LocationAddress lat={endLat} lng={endLng} />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

interface MovementItemProps {
  ping: LocationPing;
  index: number;
  total: number;
}

const MovementItem = ({ ping, index, total }: MovementItemProps) => {
  return (
    <div className="flex items-center justify-between p-2 bg-orange-50 border border-orange-200 rounded">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <span className="text-xs font-medium">Mov. {index + 1}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(ping.timestamp).toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {ping.ping_interval_used}min
        </Badge>
        <LocationAddress lat={ping.latitude} lng={ping.longitude} compact />
      </div>
    </div>
  );
};

interface LocationAddressProps {
  lat: number;
  lng: number;
  compact?: boolean;
}

const LocationAddress = ({ lat, lng, compact = false }: LocationAddressProps) => {
  const { address, loading } = useReverseGeocoding(lat, lng);

  if (loading) {
    return <Skeleton className="h-3 w-20" />;
  }

  if (!address) {
    return (
      <span className="text-xs text-muted-foreground">
        {compact ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`}
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground" title={address}>
      {compact ? (
        address.length > 25 ? `${address.substring(0, 25)}...` : address
      ) : (
        address
      )}
    </span>
  );
};

export default LocationTrackingRoute;