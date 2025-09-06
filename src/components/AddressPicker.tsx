import { useState, useEffect } from 'react';
import { MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAddressSearch } from '@/hooks/use-address-search';
import { cn } from '@/lib/utils';

interface AddressPickerProps {
  value?: string;
  onAddressSelect: (data: {
    address: string;
    formatted_address: string;
    latitude: number;
    longitude: number;
  }) => void;
  placeholder?: string;
  className?: string;
}

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

const AddressPicker = ({ 
  value = '', 
  onAddressSelect, 
  placeholder = "Cerca un indirizzo...",
  className 
}: AddressPickerProps) => {
  const [query, setQuery] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const { searchAddresses, suggestions, loading } = useAddressSearch();

  useEffect(() => {
    setQuery(value);
    setSelectedAddress(value);
  }, [value]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query && query.length >= 3 && query !== selectedAddress) {
        searchAddresses(query);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, selectedAddress, searchAddresses]);

  const handleSelectAddress = (result: AddressSearchResult) => {
    const formattedAddress = formatAddress(result);
    const inputAddress = `${result.address?.road || ''} ${result.address?.house_number || ''}`.trim() || 
                         result.address?.city || result.address?.town || result.address?.village || 
                         result.display_name;
    
    setQuery(inputAddress);
    setSelectedAddress(inputAddress);
    setShowSuggestions(false);

    onAddressSelect({
      address: inputAddress,
      formatted_address: formattedAddress,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon)
    });
  };

  const formatAddress = (result: AddressSearchResult): string => {
    const addr = result.address;
    let formatted = '';
    
    if (addr?.road) {
      formatted += addr.road;
      if (addr.house_number) {
        formatted += ` ${addr.house_number}`;
      }
    }
    
    const city = addr?.city || addr?.town || addr?.village;
    if (city && formatted) {
      formatted += `, ${city}`;
    } else if (city) {
      formatted = city;
    }

    if (addr?.postcode) {
      formatted += `, ${addr.postcode}`;
    }
    
    return formatted || result.display_name;
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {loading ? (
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <Card className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-auto">
          <CardContent className="p-0">
            {suggestions.map((result, index) => (
              <Button
                key={index}
                variant="ghost"
                className="w-full justify-start h-auto p-3 rounded-none"
                onClick={() => handleSelectAddress(result)}
              >
                <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{formatAddress(result)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {result.display_name}
                  </div>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AddressPicker;