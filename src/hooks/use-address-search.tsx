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
      // Miglioramento della query per indirizzi italiani
      let searchQuery = query.trim();
      
      // Se la query contiene numeri, assumiamo che includa un numero civico
      const hasNumber = /\d/.test(searchQuery);
      
      // Per migliorare la ricerca, aggiungiamo "Italia" se non è già presente
      if (!searchQuery.toLowerCase().includes('italia') && !searchQuery.toLowerCase().includes('italy')) {
        searchQuery += ', Italia';
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` + 
        `q=${encodeURIComponent(searchQuery)}` +
        `&format=json` +
        `&addressdetails=1` +
        `&limit=8` + // Aumentiamo il limite per avere più opzioni
        `&countrycodes=it` +
        `&accept-language=it` +
        `&bounded=1` + // Limita i risultati ai confini del paese
        `&dedupe=1`, // Rimuove duplicati
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
      
      // Filtriamo e ordiniamo i risultati per qualità
      const filteredData = data
        .filter(result => {
          // Filtriamo solo risultati italiani con informazioni utili
          const hasValidAddress = result.address && (
            result.address.road || 
            result.address.city || 
            result.address.town || 
            result.address.village
          );
          
          // Se l'utente ha inserito un numero, preferiamo risultati che hanno house_number
          if (hasNumber) {
            return hasValidAddress && result.address?.house_number;
          }
          
          return hasValidAddress;
        })
        .sort((a, b) => {
          // Ordiniamo per qualità: prima quelli con numero civico se richiesto
          if (hasNumber) {
            if (a.address?.house_number && !b.address?.house_number) return -1;
            if (!a.address?.house_number && b.address?.house_number) return 1;
          }
          
          // Poi preferiamo risultati con strada definita
          if (a.address?.road && !b.address?.road) return -1;
          if (!a.address?.road && b.address?.road) return 1;
          
          return 0;
        })
        .slice(0, 5); // Limitiamo ai migliori 5 risultati
      
      setSuggestions(filteredData);
      return filteredData;
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