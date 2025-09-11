import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LocationPing {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: Date;
  movement_detected: boolean;
  ping_interval_used: number;
}

interface UseAdaptiveLocationTrackingProps {
  timesheetId: string | null;
  userId: string;
  isActive: boolean;
}

interface LocationTrackingState {
  isTracking: boolean;
  lastLocation: { lat: number; lng: number } | null;
  currentInterval: number;
  movementDetected: boolean;
  pingsCount: number;
  error: string | null;
}

export const useAdaptiveLocationTracking = ({
  timesheetId,
  userId,
  isActive
}: UseAdaptiveLocationTrackingProps) => {
  const { toast } = useToast();
  const [state, setState] = useState<LocationTrackingState>({
    isTracking: false,
    lastLocation: null,
    currentInterval: 15, // minutes
    movementDetected: false,
    pingsCount: 0,
    error: null
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Constants for adaptive intervals
  const BASELINE_INTERVAL = 15 * 60 * 1000; // 15 minutes
  const ACTIVE_INTERVAL = 5 * 60 * 1000;    // 5 minutes
  const IDLE_INTERVAL = 25 * 60 * 1000;     // 25 minutes
  const MOVEMENT_THRESHOLD = 50; // meters

  const calculateDistance = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
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
  }, []);

  const getCurrentPosition = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // 1 minute cache
        }
      );
    });
  }, []);

  const saveLocationPing = useCallback(async (locationData: LocationPing) => {
    if (!timesheetId) return;

    try {
      const { error } = await supabase
        .from('location_pings')
        .insert({
          timesheet_id: timesheetId,
          user_id: userId,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          timestamp: locationData.timestamp.toISOString(),
          movement_detected: locationData.movement_detected,
          ping_interval_used: Math.round(locationData.ping_interval_used / (60 * 1000)) // Convert to minutes as integer
        });

      if (error) {
        console.error('Error saving location ping:', error);
        setState(prev => ({ ...prev, error: 'Errore nel salvare la posizione' }));
      } else {
        setState(prev => ({ ...prev, pingsCount: prev.pingsCount + 1, error: null }));
      }
    } catch (error) {
      console.error('Error in saveLocationPing:', error);
      setState(prev => ({ ...prev, error: 'Errore di connessione' }));
    }
  }, [timesheetId, userId]);

  const performLocationPing = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude, accuracy } = position.coords;
      
      setState(prev => {
        let movementDetected = false;
        let newInterval = BASELINE_INTERVAL;

        // Check for movement if we have a previous location
        if (prev.lastLocation) {
          const distance = calculateDistance(
            prev.lastLocation.lat,
            prev.lastLocation.lng,
            latitude,
            longitude
          );

          movementDetected = distance > MOVEMENT_THRESHOLD;
          
          // Adjust interval based on movement
          if (movementDetected) {
            newInterval = ACTIVE_INTERVAL;
            // Notify user about movement detection (optional)
            if (!prev.movementDetected) {
              toast({
                title: "Movimento rilevato",
                description: "Tracciamento più frequente attivato",
                duration: 3000,
              });
            }
          } else {
            // If no movement for a while, increase interval
            newInterval = prev.movementDetected ? BASELINE_INTERVAL : IDLE_INTERVAL;
          }
        }

        // Save the ping asynchronously
        saveLocationPing({
          latitude,
          longitude,
          accuracy: accuracy || undefined,
          timestamp: new Date(),
          movement_detected: movementDetected,
          ping_interval_used: prev.currentInterval
        });

        // Reschedule next ping with new interval
        if (intervalRef.current) {
          clearTimeout(intervalRef.current);
        }
        
        intervalRef.current = setTimeout(performLocationPing, newInterval);

        return {
          ...prev,
          lastLocation: { lat: latitude, lng: longitude },
          currentInterval: newInterval / (60 * 1000), // Convert to minutes for display
          movementDetected,
          error: null
        };
      });

    } catch (error) {
      console.error('Error getting location:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Impossibile ottenere la posizione. Verifica le autorizzazioni GPS.' 
      }));
      
      // Retry with baseline interval
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      intervalRef.current = setTimeout(performLocationPing, BASELINE_INTERVAL);
    }
  }, [calculateDistance, getCurrentPosition, saveLocationPing, toast]);

  const startTracking = useCallback(async () => {
    if (!timesheetId || !isActive) return;

    setState(prev => ({ ...prev, isTracking: true }));

    try {
      // Get initial position
      await performLocationPing();
      
      console.log('Adaptive location tracking started');
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setState(prev => ({ 
        ...prev, 
        isTracking: false, 
        error: 'Impossibile iniziare il tracciamento' 
      }));
    }
  }, [timesheetId, isActive, performLocationPing]);

  const stopTracking = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      isTracking: false,
      lastLocation: null,
      currentInterval: 15,
      movementDetected: false,
      error: null
    }));

    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    console.log('Adaptive location tracking stopped');
  }, []);

  // Effect to start/stop tracking based on active state
  useEffect(() => {
    if (isActive && timesheetId) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [isActive, timesheetId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return {
    ...state,
    startTracking,
    stopTracking
  };
};