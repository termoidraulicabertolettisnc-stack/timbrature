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
    }, 500); // Aumentato debounce per stabilità

    return () => clearTimeout(timeoutId);
  }, [query, selectedAddress, searchAddresses]);

  const handleSelectAddress = (result: AddressSearchResult) => {
    const addr = result.address;
    
    // Costruiamo un indirizzo completo e ben formattato
    let fullAddress = '';
    const addressParts: string[] = [];
    
    // Parte strada + numero civico
    if (addr?.road) {
      let roadPart = addr.road;
      if (addr.house_number) {
        roadPart += ` ${addr.house_number}`;
      } else {
        // Se il numero civico non è presente nel risultato ma era nella query originale,
        // preserviamo il numero civico dalla query dell'utente
        const queryNumbers = query.match(/\d+/g);
        if (queryNumbers && queryNumbers.length > 0) {
          const roadInQuery = query.toLowerCase().includes(addr.road.toLowerCase());
          if (roadInQuery) {
            roadPart += ` ${queryNumbers[0]}`;
          }
        }
      }
      addressParts.push(roadPart);
    } else {
      // Fallback se non c'è una strada definita
      const fallback = addr?.city || addr?.town || addr?.village || result.display_name.split(',')[0];
      addressParts.push(fallback);
    }
    
    // Aggiungiamo città e CAP
    const city = addr?.city || addr?.town || addr?.village;
    if (city) {
      let cityPart = city;
      if (addr?.postcode) {
        cityPart = `${addr.postcode} ${city}`;
      }
      addressParts.push(cityPart);
    }
    
    // Creiamo l'indirizzo completo
    fullAddress = addressParts.join(', ');
    
    setQuery(fullAddress);
    setSelectedAddress(fullAddress);
    setShowSuggestions(false);

    onAddressSelect({
      address: fullAddress,
      formatted_address: fullAddress,
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon)
    });
  };

  const handleUseTypedAddress = () => {
    // Usa l'indirizzo esatto che l'utente ha digitato
    // Tenta di estrarre coordinate dal primo risultato dei suggerimenti se disponibile
    let lat = 0;
    let lng = 0;
    
    if (suggestions.length > 0) {
      const firstResult = suggestions[0];
      lat = parseFloat(firstResult.lat);
      lng = parseFloat(firstResult.lon);
    }
    
    setSelectedAddress(query);
    setShowSuggestions(false);

    onAddressSelect({
      address: query,
      formatted_address: query,
      latitude: lat,
      longitude: lng
    });
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
                  <div className="font-medium">{result.display_name}</div>
                </div>
              </Button>
            ))}
            {query && query.length >= 3 && (
              <Button
                variant="ghost" 
                className="w-full justify-start h-auto p-3 rounded-none border-t"
                onClick={handleUseTypedAddress}
              >
                <MapPin className="h-4 w-4 mr-2 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-medium">Usa indirizzo digitato: {query}</div>
                  <div className="text-xs text-muted-foreground">
                    Clicca per usare l'indirizzo esatto che hai digitato
                  </div>
                </div>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AddressPicker;