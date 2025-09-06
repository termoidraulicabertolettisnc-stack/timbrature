import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Navigation } from 'lucide-react';

interface LocationTrackingIndicatorProps {
  timesheetId: string;
}

const LocationTrackingIndicator = ({ timesheetId }: LocationTrackingIndicatorProps) => {
  const [pingsCount, setPingsCount] = useState<number>(0);
  const [movementCount, setMovementCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPingsSummary();
  }, [timesheetId]);

  const loadPingsSummary = async () => {
    try {
      const { data, error } = await supabase
        .from('location_pings')
        .select('movement_detected')
        .eq('timesheet_id', timesheetId);

      if (error) throw error;

      const totalPings = data?.length || 0;
      const movements = data?.filter(ping => ping.movement_detected).length || 0;

      setPingsCount(totalPings);
      setMovementCount(movements);
    } catch (error) {
      console.error('Error loading pings summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (pingsCount === 0) {
    return null; // Don't show anything if no tracking data
  }

  return (
    <div className="flex items-center gap-1">
      <Navigation className="h-3 w-3 text-green-600" />
      <Badge variant="secondary" className="text-xs px-1 py-0">
        {pingsCount}
      </Badge>
      {movementCount > 0 && (
        <Badge variant="outline" className="text-xs px-1 py-0 text-orange-600">
          {movementCount}M
        </Badge>
      )}
    </div>
  );
};

export default LocationTrackingIndicator;