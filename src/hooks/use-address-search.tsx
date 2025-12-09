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
  city?: string;
  province?: string;
  country?: string;
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
        console.log('🔍 Using cached results:', cachedResults.length, 'suggestions');
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

      console.log('🔍 Raw API response:', data);

      const results: AddressSearchResult[] = data?.suggestions?.map((suggestion: any) => ({
        display_name: suggestion.display_name,
        place_id: suggestion.place_id,
        main_text: suggestion.main_text,
        secondary_text: suggestion.secondary_text
      })) || [];
      
      console.log('🔍 Processed results:', results.length, 'suggestions', results);
      
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
          placeId: placeId
        }
      });

      if (error) {
        throw new Error(`Geocoding error: ${error.message}`);
      }

      if (data) {
        // Extract city and province from address_components
        let city: string | undefined;
        let province: string | undefined;
        let country: string | undefined;

        if (data.address_components) {
          for (const component of data.address_components) {
            if (component.types.includes('locality')) {
              city = component.long_name;
            } else if (component.types.includes('administrative_area_level_3') && !city) {
              // Fallback to administrative_area_level_3 if no locality
              city = component.long_name;
            } else if (component.types.includes('administrative_area_level_2')) {
              province = component.short_name; // Province usually abbreviated (e.g., "MI", "RM")
            } else if (component.types.includes('country')) {
              country = component.long_name;
            }
          }
        }

        return {
          latitude: data.latitude,
          longitude: data.longitude,
          formatted_address: data.formatted_address,
          city,
          province,
          country
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
