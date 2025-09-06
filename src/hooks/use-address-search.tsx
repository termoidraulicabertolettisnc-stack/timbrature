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
      // Strategia di ricerca progressiva per indirizzi italiani
      let results: AddressSearchResult[] = [];
      
      // Strategia 1: Ricerca completa con miglioramenti
      results = await performEnhancedSearch(query, abortControllerRef.current.signal);
      
      // Strategia 2: Se pochi risultati e c'è un numero, prova senza numero civico
      if (results.length < 3) {
        const queryWithoutNumber = query.replace(/\d+/g, '').trim().replace(/\s+/g, ' ');
        if (queryWithoutNumber !== query && queryWithoutNumber.length >= 3) {
          const additionalResults = await performEnhancedSearch(queryWithoutNumber, abortControllerRef.current.signal);
          results = [...results, ...additionalResults];
        }
      }
      
      // Strategia 3: Se ancora pochi risultati, prova con approccio regionale
      if (results.length < 3) {
        const regionalResults = await performRegionalSearch(query, abortControllerRef.current.signal);
        results = [...results, ...regionalResults];
      }

      // Filtra e ordina i risultati per rilevanza
      const processedResults = processResults(results, query);
      
      // Salva nel cache
      cacheRef.current.set(normalizedQuery, {
        query: normalizedQuery,
        results: processedResults,
        timestamp: Date.now()
      });
      
      // Mantieni cache limitato (max 100 entries)
      if (cacheRef.current.size > 100) {
        const oldestKey = cacheRef.current.keys().next().value;
        cacheRef.current.delete(oldestKey);
      }

      setSuggestions(processedResults);
      return processedResults;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Ricerca indirizzo annullata');
        return suggestions;
      }
      
      console.error('Errore ricerca indirizzo:', error);
      setSuggestions([]);
      return [];
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const performEnhancedSearch = async (searchQuery: string, signal: AbortSignal): Promise<AddressSearchResult[]> => {
    // Miglioramento della query per risultati italiani più precisi
    let enhancedQuery = searchQuery.trim();
    
    // Aggiungi contesto geografico se mancante
    if (!enhancedQuery.toLowerCase().includes('ital') && !enhancedQuery.toLowerCase().includes('cremona')) {
      // Se sembra un indirizzo completo, aggiungi ", Italia"
      if (/\d/.test(enhancedQuery) || enhancedQuery.split(' ').length > 2) {
        enhancedQuery += ', Italia';
      }
    }

    const params = new URLSearchParams({
      q: enhancedQuery,
      format: 'json',
      addressdetails: '1',
      limit: '15',
      countrycodes: 'it',
      'accept-language': 'it',
      bounded: '1',
      dedupe: '1',
      'exclude_place_ids': '',
      viewbox: '6.627,35.493,18.520,47.091'
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'User-Agent': 'TimesheetApp/1.0 (contact@example.com)'
        },
        signal
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Ricerca indirizzo fallita`);
    }
    
    return await response.json();
  };

  const performRegionalSearch = async (query: string, signal: AbortSignal): Promise<AddressSearchResult[]> => {
    // Estrai il nome della strada dalla query
    const streetMatch = query.match(/^(via|viale|corso|piazza|largo|str\.?|v\.?)\s+([^,\d]+)/i);
    if (!streetMatch) return [];

    const streetName = streetMatch[0].trim();
    const regionalQuery = `${streetName}, Lombardia, Italia`;

    const params = new URLSearchParams({
      q: regionalQuery,
      format: 'json',
      addressdetails: '1',
      limit: '10',
      countrycodes: 'it',
      'accept-language': 'it',
      bounded: '1',
      dedupe: '1',
      'exclude_place_ids': '',
      viewbox: '6.627,35.493,18.520,47.091'
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          'User-Agent': 'TimesheetApp/1.0 (contact@example.com)'
        },
        signal
      }
    );
    
    if (!response.ok) return [];
    
    return await response.json();
  };

  const processResults = (results: AddressSearchResult[], originalQuery: string): AddressSearchResult[] => {
    // Rimuovi duplicati basati su coordinate
    const uniqueResults = results.filter((result, index, arr) => {
      return index === arr.findIndex(r => 
        Math.abs(parseFloat(r.lat) - parseFloat(result.lat)) < 0.001 &&
        Math.abs(parseFloat(r.lon) - parseFloat(result.lon)) < 0.001
      );
    });

    // Filtra e valuta risultati
    const filteredData = uniqueResults
      .filter(result => {
        // Deve essere in Italia
        if (!result.display_name.toLowerCase().includes('ital')) {
          return false;
        }
        
        // Deve avere informazioni address valide
        if (!result.address) return false;
        
        const addr = result.address;
        return addr.road || addr.city || addr.town || addr.village;
      })
      .map(result => ({
        ...result,
        relevanceScore: calculateEnhancedRelevance(result, originalQuery)
      }))
      .sort((a: any, b: any) => {
        // Ordina per rilevanza e importanza
        const scoreA = a.relevanceScore + (parseFloat(a.importance || '0') * 0.1);
        const scoreB = b.relevanceScore + (parseFloat(b.importance || '0') * 0.1);
        return scoreB - scoreA;
      })
      .slice(0, 8) // Top 8 risultati
      .map(({ relevanceScore, ...result }: any) => result);

    return filteredData;
  };

  const calculateEnhancedRelevance = (result: AddressSearchResult, query: string): number => {
    let score = 0;
    const queryLower = query.toLowerCase();
    const displayLower = result.display_name.toLowerCase();
    const addr = result.address;
    
    // Bonus alta priorità per corrispondenza esatta strada
    if (addr?.road) {
      const roadLower = addr.road.toLowerCase();
      if (queryLower.includes(roadLower)) {
        score += 20;
        // Bonus extra se la strada è all'inizio della query
        if (queryLower.startsWith(roadLower) || queryLower.includes(`via ${roadLower}`) || queryLower.includes(`viale ${roadLower}`)) {
          score += 10;
        }
      }
    }
    
    // Bonus per città/località
    if (addr?.city && queryLower.includes(addr.city.toLowerCase())) {
      score += 15;
    }
    if (addr?.town && queryLower.includes(addr.town.toLowerCase())) {
      score += 15;
    }
    
    // Bonus molto alto per numero civico corrispondente
    const queryNumbers = query.match(/\d+/g);
    if (queryNumbers && addr?.house_number) {
      if (queryNumbers.some(num => addr.house_number?.includes(num))) {
        score += 25;
      }
    }
    
    // Bonus per località specifica di Cremona
    if (displayLower.includes('cremona')) {
      score += 10;
    }
    
    // Penalità per risultati troppo generici
    if (displayLower.split(',').length > 6) {
      score -= 3;
    }
    
    // Bonus se ha tutte le informazioni essenziali
    if (addr?.road && addr?.city && addr?.postcode) {
      score += 5;
    }
    
    return score;
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