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
    let allResults: AddressSearchResult[] = [];

    // Extract house number for targeted search
    const houseNumberMatch = query.match(/\d+/);
    const houseNumber = houseNumberMatch ? houseNumberMatch[0] : null;
    
    // Multiple search strategies optimized for Italian addresses with house numbers
    const searchStrategies = [
      // Strategy 1: Exact query as-is (most specific)
      query.trim(),
      
      // Strategy 2: With Italia suffix
      `${query.trim()}, Italia`,
      
      // Strategy 3: If house number exists, try with specific formatting
      houseNumber ? `${query.replace(/\d+/, '').trim()} ${houseNumber}, Cremona, Italia` : null,
      
      // Strategy 4: Broader search with region
      `${query.trim()}, Cremona, Lombardia, Italia`,
      
      // Strategy 5: Street only if we have house number (to get the exact street first)
      houseNumber ? `${query.replace(/\d+/, '').trim()}, Cremona, Italia` : null,
    ].filter(Boolean);

    console.log('🔍 Search strategies:', searchStrategies);

    for (const [index, searchQuery] of searchStrategies.entries()) {
      if (signal.aborted) break;
      
      try {
        console.log(`Strategy ${index + 1}: "${searchQuery}"`);
        
        const params = new URLSearchParams({
          q: searchQuery,
          format: 'json',
          addressdetails: '1',
          limit: index === 0 ? '20' : '10', // More results for exact query
          countrycodes: 'it',
          'accept-language': 'it',
          bounded: '0',
          dedupe: '1',
          // Add specific parameters for better address matching
          extratags: '1',
          namedetails: '1'
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
        console.log(`Strategy ${index + 1} results:`, results.length);
        
        if (results && results.length > 0) {
          // Add strategy info to results for debugging
          const taggedResults = results.map(r => ({ ...r, searchStrategy: index + 1 }));
          allResults = [...allResults, ...taggedResults];
          
          // If first strategy (exact query) gives good results, prioritize them
          if (index === 0 && results.length >= 3) {
            console.log('✅ Good results from exact query, prioritizing');
            break;
          }
        }
        
        // Small delay between requests to be respectful to the API
        if (index < searchStrategies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        console.warn(`Search error for "${searchQuery}":`, error);
        continue;
      }
    }

    console.log(`📊 Total results collected: ${allResults.length}`);
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
    
    // Extract key components from query
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 1);
    const queryNumbers = queryLower.match(/\d+/g) || [];
    
    // Base score for word matches
    const matchedWords = queryWords.filter(word => displayNameLower.includes(word));
    score += (matchedWords.length / queryWords.length) * 0.3;
    
    if (result.address) {
      const { road, house_number, city, town, village, postcode } = result.address;
      
      // CRITICAL: Exact house number match gets highest priority
      if (house_number && queryNumbers.length > 0) {
        const hasHouseNumberMatch = queryNumbers.some(num => 
          house_number === num || house_number.includes(num)
        );
        if (hasHouseNumberMatch) {
          score += 0.5; // Very high score for house number match
          console.log(`🎯 House number match found: ${house_number}`);
        }
      }
      
      // Road name exact match
      if (road && queryLower.includes(road.toLowerCase())) {
        score += 0.35;
        
        // Extra bonus if query starts with road name
        const roadVariants = [
          road.toLowerCase(),
          `via ${road.toLowerCase()}`,
          `viale ${road.toLowerCase()}`,
          `corso ${road.toLowerCase()}`,
          `piazza ${road.toLowerCase()}`
        ];
        
        if (roadVariants.some(variant => queryLower.startsWith(variant))) {
          score += 0.15;
        }
      }
      
      // City/town match with special focus on Cremona
      const cityName = city || town || village;
      if (cityName) {
        const cityLower = cityName.toLowerCase();
        if (queryLower.includes(cityLower)) {
          score += cityLower === 'cremona' ? 0.25 : 0.2; // Bonus for Cremona
        }
      }
      
      // Postcode match
      if (postcode && queryNumbers.some(num => postcode.includes(num))) {
        score += 0.15;
      }
      
      // Bonus for complete addresses (road + house_number + city)
      if (road && house_number && cityName) {
        score += 0.1;
      }
      
      // Special bonus for exact query match in display name
      if (displayNameLower.includes(queryLower)) {
        score += 0.2;
      }
    }
    
    // Penalty for very long addresses (too generic)
    if (displayNameLower.length > 150) {
      score *= 0.85;
    }
    
    // Bonus for addresses in target region
    if (displayNameLower.includes('cremona')) {
      score += 0.15;
    } else if (displayNameLower.includes('lombardia')) {
      score += 0.1;
    }
    
    // Penalty for addresses that are just streets without numbers when number was requested
    if (queryNumbers.length > 0 && !result.address?.house_number) {
      score *= 0.7; // Reduce score if no house number when one was requested
    }
    
    console.log(`Relevance for "${result.display_name}": ${score.toFixed(3)}`);
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
