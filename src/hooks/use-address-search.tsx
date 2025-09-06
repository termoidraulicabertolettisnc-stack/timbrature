import { useState, useRef } from 'react';

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
  const cacheRef = useRef<Map<string, CachedResult>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const searchAddresses = async (query: string): Promise<AddressSearchResult[]> => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return [];
    }

    // Normalizza la query per il cache
    const normalizedQuery = query.toLowerCase().trim();
    
    // Controlla il cache (valido per 5 minuti)
    const cached = cacheRef.current.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      setSuggestions(cached.results);
      return cached.results;
    }

    // Cancella richiesta precedente se in corso
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      // Miglioramento della query per risultati italiani più precisi
      let searchQuery = query.trim();
      
      // Aggiungi "Italia" se non presente e se sembra un indirizzo completo
      const hasLocation = /\d/.test(searchQuery) || searchQuery.split(' ').length > 2;
      if (hasLocation && !searchQuery.toLowerCase().includes('ital')) {
        searchQuery += ', Italia';
      }

      const params = new URLSearchParams({
        q: searchQuery,
        format: 'json',
        addressdetails: '1',
        limit: '10',
        countrycodes: 'it',
        'accept-language': 'it',
        bounded: '1',
        dedupe: '1',
        'exclude_place_ids': '', // Evita risultati duplicati
        viewbox: '6.627,35.493,18.520,47.091' // Bounding box Italia
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'User-Agent': 'TimesheetApp/1.0 (contact@example.com)'
          },
          signal: abortControllerRef.current.signal
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Ricerca indirizzo fallita`);
      }
      
      const data: AddressSearchResult[] = await response.json();
      
      // Filtri avanzati per qualità dei risultati
      const filteredData = data
        .filter(result => {
          // Deve essere in Italia
          if (!result.display_name.toLowerCase().includes('ital')) {
            return false;
          }
          
          // Deve avere informazioni address valide
          if (!result.address) return false;
          
          const addr = result.address;
          const hasStreet = addr.road || addr.city || addr.town || addr.village;
          
          // Se l'utente ha inserito un numero, preferiamo risultati precisi
          const userHasNumber = /\d/.test(query);
          if (userHasNumber) {
            return hasStreet && (addr.house_number || addr.road);
          }
          
          return hasStreet;
        })
        .map(result => ({
          ...result,
          // Calcola score di rilevanza
          relevanceScore: calculateRelevance(result, query)
        }))
        .sort((a: any, b: any) => {
          // Ordina per rilevanza e importanza
          const scoreA = a.relevanceScore + (parseFloat(a.importance || '0') * 0.1);
          const scoreB = b.relevanceScore + (parseFloat(b.importance || '0') * 0.1);
          return scoreB - scoreA;
        })
        .slice(0, 5) // Top 5 risultati
        .map(({ relevanceScore, ...result }: any) => result); // Rimuovi score temporaneo

      // Salva nel cache
      cacheRef.current.set(normalizedQuery, {
        query: normalizedQuery,
        results: filteredData,
        timestamp: Date.now()
      });
      
      // Mantieni cache limitato (max 100 entries)
      if (cacheRef.current.size > 100) {
        const oldestKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldestKey);
      }

      setSuggestions(filteredData);
      return filteredData;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Ricerca indirizzo annullata');
        return suggestions; // Mantieni risultati precedenti
      }
      
      console.error('Errore ricerca indirizzo:', error);
      setSuggestions([]);
      return [];
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const calculateRelevance = (result: AddressSearchResult, query: string): number => {
    let score = 0;
    const queryLower = query.toLowerCase();
    const displayLower = result.display_name.toLowerCase();
    const addr = result.address;
    
    // Bonus se il nome della strada/città corrisponde
    if (addr?.road && queryLower.includes(addr.road.toLowerCase())) {
      score += 10;
    }
    
    if (addr?.city && queryLower.includes(addr.city.toLowerCase())) {
      score += 8;
    }
    
    if (addr?.town && queryLower.includes(addr.town.toLowerCase())) {
      score += 8;
    }
    
    // Bonus per numero civico se l'utente l'ha inserito
    const queryNumbers = query.match(/\d+/g);
    if (queryNumbers && addr?.house_number) {
      const houseNum = addr.house_number;
      if (queryNumbers.some(num => houseNum.includes(num))) {
        score += 15;
      }
    }
    
    // Penalità per display_name troppo lungo o generico
    if (displayLower.split(',').length > 5) {
      score -= 2;
    }
    
    return score;
  };

  const geocodeAddress = async (address: string): Promise<GeocodeResult | null> => {
    if (!address) return null;

    try {
      const params = new URLSearchParams({
        q: address + ', Italia',
        format: 'json',
        addressdetails: '1',
        limit: '1',
        countrycodes: 'it',
        'accept-language': 'it'
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'User-Agent': 'TimesheetApp/1.0 (contact@example.com)'
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