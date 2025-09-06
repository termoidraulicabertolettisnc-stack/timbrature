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

      console.log('🔍 Searching with enhanced Nominatim:', query);

      // Enhanced search with better Italian address handling
      const results = await performEnhancedNominatimSearch(query, signal);
      
      if (signal.aborted) return [];

      // Process and score results
      const processedResults = processResults(results, query);
      
      // Cache the results
      cache.current[cacheKey] = processedResults;
      
      setSuggestions(processedResults);
      return processedResults;

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

  const performEnhancedNominatimSearch = async (query: string, signal: AbortSignal): Promise<AddressSearchResult[]> => {
    // Multiple search strategies for better Italian results
    const searchStrategies = [
      // Strategy 1: Enhanced query with Italia
      `${query.trim()}, Italia`,
      // Strategy 2: Query with Lombardia region
      `${query.trim()}, Lombardia, Italia`,
      // Strategy 3: Original query if it contains Italy already
      query.toLowerCase().includes('italia') || query.toLowerCase().includes('italy') 
        ? query.trim() 
        : null
    ].filter(Boolean);

    let allResults: AddressSearchResult[] = [];

    for (const searchQuery of searchStrategies) {
      if (signal.aborted) break;
      
      try {
        const params = new URLSearchParams({
          q: searchQuery,
          format: 'json',
          addressdetails: '1',
          limit: '15',
          countrycodes: 'it',
          'accept-language': 'it',
          bounded: '0',
          dedupe: '1'
        });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          {
            headers: {
              'User-Agent': 'TimesheetApp/1.0'
            },
            signal
          }
        );

        if (!response.ok) {
          console.warn(`Search failed for: ${searchQuery}`);
          continue;
        }

        const results = await response.json();
        if (results && results.length > 0) {
          allResults = [...allResults, ...results];
          // If we got good results from first strategy, no need to try others
          if (results.length >= 5) break;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        console.warn(`Search error for "${searchQuery}":`, error);
        continue;
      }
    }

    return allResults;
  };

  const processResults = (results: AddressSearchResult[], originalQuery: string): AddressSearchResult[] => {
    if (!results || results.length === 0) return [];

    console.log(`📊 Processing ${results.length} raw results`);

    // Enhanced filtering and scoring
    const scoredResults = results
      .filter(result => {
        // Must be in Italy
        const displayLower = result.display_name.toLowerCase();
        if (!displayLower.includes('italia') && !displayLower.includes('italy')) {
          return false;
        }

        // Must have address components
        if (!result.address) return false;
        
        const addr = result.address;
        return addr.road || addr.city || addr.town || addr.village;
      })
      .map(result => ({
        ...result,
        relevanceScore: calculateEnhancedRelevance(result, originalQuery)
      }))
      .filter(result => result.relevanceScore > 0.1) // Lower threshold for better coverage
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Remove duplicates based on coordinates (within 100m)
    const uniqueResults: AddressSearchResult[] = [];
    
    for (const result of scoredResults) {
      const isDuplicate = uniqueResults.some(existing => {
        if (!existing.lat || !existing.lon || !result.lat || !result.lon) return false;
        
        const distance = calculateDistance(
          parseFloat(existing.lat), parseFloat(existing.lon),
          parseFloat(result.lat), parseFloat(result.lon)
        );
        
        return distance < 100; // 100 meters threshold
      });

      if (!isDuplicate) {
        uniqueResults.push({
          display_name: result.display_name,
          lat: result.lat,
          lon: result.lon,
          address: result.address
        });
      }
    }

    console.log(`🎯 Final unique results: ${uniqueResults.length}`);
    
    return uniqueResults.slice(0, 8);
  };

  const calculateEnhancedRelevance = (result: AddressSearchResult, query: string): number => {
    const queryLower = query.toLowerCase().trim();
    const displayNameLower = result.display_name.toLowerCase();
    
    let score = 0;
    
    // Base score for containing query terms
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
    const matchedWords = queryWords.filter(word => displayNameLower.includes(word));
    score += (matchedWords.length / queryWords.length) * 0.4;
    
    // Enhanced scoring for address components
    if (result.address) {
      const { road, house_number, city, town, village, postcode } = result.address;
      
      // Road name exact match bonus
      if (road && queryLower.includes(road.toLowerCase())) {
        score += 0.35;
        
        // Extra bonus if query starts with road name
        const roadVariants = [
          road.toLowerCase(),
          `via ${road.toLowerCase()}`,
          `viale ${road.toLowerCase()}`,
          `corso ${road.toLowerCase()}`,
        ];
        
        if (roadVariants.some(variant => queryLower.startsWith(variant))) {
          score += 0.2;
        }
      }
      
      // House number match
      const queryNumbers = queryLower.match(/\d+/g);
      if (house_number && queryNumbers?.some(num => house_number.includes(num))) {
        score += 0.25;
      }
      
      // City/town match
      const cityName = city || town || village;
      if (cityName && queryLower.includes(cityName.toLowerCase())) {
        score += 0.2;
      }
      
      // Postcode match
      if (postcode && queryLower.includes(postcode)) {
        score += 0.15;
      }
      
      // Bonus for complete addresses
      if (road && cityName && postcode) {
        score += 0.1;
      }
    }
    
    // Penalty for very long addresses (less specific)
    if (displayNameLower.length > 150) {
      score *= 0.9;
    }
    
    // Bonus for Cremona area (user's region)
    if (displayNameLower.includes('cremona') || displayNameLower.includes('lombardia')) {
      score += 0.1;
    }
    
    return Math.min(score, 1.0);
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  const geocodeAddress = useCallback(async (address: string, placeId?: string): Promise<GeocodeResult | null> => {
    try {
      console.log('🌍 Geocoding address:', address);
      
      // Use Nominatim for geocoding
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
            'User-Agent': 'TimesheetApp/1.0'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Geocoding failed');
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          formatted_address: result.display_name
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
