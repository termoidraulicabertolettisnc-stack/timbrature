import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AddressSearchResult {
  display_name: string;
  place_id?: string;
  main_text?: string;
  secondary_text?: string;
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    postcode?: string;
    state?: string;
  };
  importance?: number;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

interface CachedResult {
  query: string;
  results: AddressSearchResult[];
  timestamp: number;
}

export const useAddressSearch = () => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSearchResult[]>([]);
  const cache = useRef<Record<string, AddressSearchResult[]>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const searchAddresses = useCallback(async (query: string): Promise<AddressSearchResult[]> => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return [];
    }

    setLoading(true);
    
    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      // Check cache first
      const cacheKey = query.toLowerCase().trim();
      if (cache.current[cacheKey]) {
        const cachedResults = cache.current[cacheKey];
        setSuggestions(cachedResults);
        return cachedResults;
      }

      console.log('🔍 Searching with Google Maps API:', query);

      // Call Google Maps Autocomplete API through edge function
      const { data, error } = await supabase.functions.invoke('google-geocoding', {
        body: {
          action: 'autocomplete',
          query: query
        }
      });

      if (signal.aborted) return [];

      if (error) {
        throw new Error(error.message || 'Google Maps API error');
      }

      const results = data?.suggestions || [];
      
      // Cache the results
      cache.current[cacheKey] = results;
      
      setSuggestions(results);
      return results;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Search aborted');
        return [];
      }
      console.error('Address search error:', error);
      setSuggestions([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const geocodeAddress = useCallback(async (address: string, placeId?: string): Promise<GeocodeResult | null> => {
    try {
      console.log('🌍 Geocoding address:', address, placeId ? `(Place ID: ${placeId})` : '');
      
      const { data, error } = await supabase.functions.invoke('google-geocoding', {
        body: {
          action: 'geocode',
          query: address,
          placeId: placeId
        }
      });

      if (error) {
        throw new Error(error.message || 'Geocoding failed');
      }

      if (data) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          formatted_address: data.formatted_address
        };
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }, []);

  return { searchAddresses, geocodeAddress, suggestions, loading };
};
