import { useState, useEffect } from 'react';

interface Address {
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

interface GeocodingResult {
  address: string | null;
  loading: boolean;
  error: boolean;
}

export const useReverseGeocoding = (lat: number | null, lng: number | null): GeocodingResult => {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lng) {
      setAddress(null);
      setLoading(false);
      setError(false);
      return;
    }

    const fetchAddress = async () => {
      setLoading(true);
      setError(false);
      
      try {
        // Using OpenStreetMap Nominatim (free service)
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=it`,
          {
            headers: {
              'User-Agent': 'TimesheetApp/1.0'
            }
          }
        );
        
        if (!response.ok) {
          throw new Error('Geocoding failed');
        }
        
        const data: Address = await response.json();
        
        if (data.display_name) {
          // Format a cleaner address
          const addr = data.address;
          let formattedAddress = '';
          
          if (addr?.road) {
            formattedAddress += addr.road;
            if (addr.house_number) {
              formattedAddress += ` ${addr.house_number}`;
            }
          }
          
          const city = addr?.city || addr?.town || addr?.village;
          if (city && formattedAddress) {
            formattedAddress += `, ${city}`;
          } else if (city) {
            formattedAddress = city;
          }
          
          // Fallback to display_name if we couldn't format properly
          if (!formattedAddress) {
            const parts = data.display_name.split(',');
            formattedAddress = parts.slice(0, 3).join(',').trim();
          }
          
          setAddress(formattedAddress || data.display_name);
        } else {
          setAddress(null);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
        setError(true);
        setAddress(null);
      } finally {
        setLoading(false);
      }
    };

    // Add a small delay to avoid too many requests
    const timer = setTimeout(fetchAddress, 300);
    return () => clearTimeout(timer);
  }, [lat, lng]);

  return { address, loading, error };
};