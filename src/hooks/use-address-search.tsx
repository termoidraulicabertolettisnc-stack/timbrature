import { useState } from 'react';

interface AddressSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    postcode?: string;
  };
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
}

export const useAddressSearch = () => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSearchResult[]>([]);

  const searchAddresses = async (query: string): Promise<AddressSearchResult[]> => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return [];
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=it&accept-language=it`,
        {
          headers: {
            'User-Agent': 'TimesheetApp/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Ricerca indirizzo fallita');
      }
      
      const data: AddressSearchResult[] = await response.json();
      setSuggestions(data);
      return data;
    } catch (error) {
      console.error('Errore ricerca indirizzo:', error);
      setSuggestions([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
    if (!address) return null;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1&countrycodes=it&accept-language=it`,
        {
          headers: {
            'User-Agent': 'TimesheetApp/1.0'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Geocoding fallito');
      }
      
      const data: AddressSearchResult[] = await response.json();
      
      if (data.length > 0) {
        const result = data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          formatted_address: result.display_name
        };
      }
      
      return null;
    } catch (error) {
      console.error('Errore geocoding:', error);
      return null;
    }
  };

  return {
    searchAddresses,
    geocodeAddress,
    suggestions,
    loading
  };
};