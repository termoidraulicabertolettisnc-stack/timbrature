import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AddressSearchResult {
  display_name: string;
  place_id?: string;
  main_text?: string;
  secondary_text?: string;
  lat?: string;
  lon?: string;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
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

    try {
      // Check cache first
      const cacheKey = query.toLowerCase().trim();
      if (cache.current[cacheKey]) {
        const cachedResults = cache.current[cacheKey];
        setSuggestions(cachedResults);
        return cachedResults;
      }

      console.log('🔍 Searching with Google Maps:', query);

      // Call Google Maps Edge Function for autocomplete
      const { data, error } = await supabase.functions.invoke('google-geocoding', {
        body: {
          action: 'autocomplete',
          query: query
        }
      });

      if (error) {
        throw new Error(`Google Maps API error: ${error.message}`);
      }

      const results: AddressSearchResult[] = data?.suggestions?.map((suggestion: any) => ({
        display_name: suggestion.description,
        place_id: suggestion.place_id,
        main_text: suggestion.structured_formatting?.main_text,
        secondary_text: suggestion.structured_formatting?.secondary_text
      })) || [];
      
      // Cache the results
      cache.current[cacheKey] = results;
      
      setSuggestions(results);
      return results;

    } catch (error) {
      console.error('Address search error:', error);
      setSuggestions([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const geocodeAddress = useCallback(async (address: string, placeId?: string): Promise<GeocodeResult | null> => {
    try {
      console.log('🌍 Geocoding address:', address, placeId ? `(place_id: ${placeId})` : '');
      
      // Call Google Maps Edge Function for geocoding
      const { data, error } = await supabase.functions.invoke('google-geocoding', {
        body: {
          action: 'geocode',
          query: address,
          place_id: placeId
        }
      });

      if (error) {
        throw new Error(`Geocoding error: ${error.message}`);
      }

      if (data?.result) {
        return {
          latitude: data.result.latitude,
          longitude: data.result.longitude,
          formatted_address: data.result.formatted_address
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
