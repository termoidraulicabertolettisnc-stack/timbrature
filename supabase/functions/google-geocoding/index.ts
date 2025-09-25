import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleGeocodingResult {
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  place_id: string;
}

interface GooglePlacesResult {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, query, placeId } = await req.json()
    const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')

    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps API key not configured')
    }

    if (action === 'autocomplete') {
      // Google Places Autocomplete API
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
      url.searchParams.set('input', query)
      url.searchParams.set('key', GOOGLE_MAPS_API_KEY)
      url.searchParams.set('components', 'country:it') // Restrict to Italy
      url.searchParams.set('language', 'it')
      url.searchParams.set('types', 'address')

      const response = await fetch(url.toString())
      const data = await response.json()

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${data.status}`)
      }

      const suggestions = data.predictions?.map((prediction: GooglePlacesResult) => ({
        display_name: prediction.description,
        place_id: prediction.place_id,
        main_text: prediction.structured_formatting.main_text,
        secondary_text: prediction.structured_formatting.secondary_text
      })) || []

      return new Response(
        JSON.stringify({ suggestions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'geocode') {
      let url: URL

      if (placeId) {
        // Use Place Details API for place_id
        url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
        url.searchParams.set('place_id', placeId)
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY)
        url.searchParams.set('language', 'it')
        url.searchParams.set('fields', 'formatted_address,geometry,address_components')
      } else {
        // Use Geocoding API for text query
        url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
        url.searchParams.set('address', query)
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY)
        url.searchParams.set('components', 'country:IT')
        url.searchParams.set('language', 'it')
      }

      const response = await fetch(url.toString())
      const data = await response.json()

      if (data.status !== 'OK') {
        throw new Error(`Google Geocoding API error: ${data.status}`)
      }

      const result = placeId ? data.result : data.results[0]
      if (!result) {
        return new Response(
          JSON.stringify({ error: 'No results found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
      }

      return new Response(
        JSON.stringify({
          formatted_address: result.formatted_address,
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          address_components: result.address_components
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')

  } catch (error) {
    console.error('Google Geocoding error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})