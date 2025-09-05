import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox access token - in production this should come from Supabase Edge Function Secrets
const MAPBOX_TOKEN = 'pk.eyJ1IjoibG92YWJsZSIsImEiOiJjbTNsbXIyYzIwZGNkMmxzYmo0djZkcnhyIn0.2vV0TlY3FVcJgvr17Am6DQ';

interface MapViewProps {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  height?: string;
  className?: string;
  showDistance?: boolean;
}

const MapView = ({ 
  startLat, 
  startLng, 
  endLat, 
  endLng, 
  height = "200px",
  className = "",
  showDistance = false 
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Set Mapbox access token
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Calculate center and bounds
    const positions = [];
    if (startLat && startLng) positions.push([startLng, startLat]);
    if (endLat && endLng) positions.push([endLng, endLat]);

    if (positions.length === 0) return;

    let center: [number, number];
    let zoom = 15;

    if (positions.length === 1) {
      center = positions[0] as [number, number];
    } else {
      // Calculate center between two points
      center = [
        (positions[0][0] + positions[1][0]) / 2,
        (positions[0][1] + positions[1][1]) / 2
      ] as [number, number];
      zoom = 14;
    }

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: center,
      zoom: zoom,
      attributionControl: false
    });

    // Add markers
    if (startLat && startLng) {
      const startMarker = new mapboxgl.Marker({ 
        color: '#22c55e' // green for start
      })
        .setLngLat([startLng, startLat])
        .setPopup(new mapboxgl.Popup().setHTML('<div class="text-sm font-medium">Entrata</div>'))
        .addTo(map.current);
    }

    if (endLat && endLng) {
      const endMarker = new mapboxgl.Marker({ 
        color: '#ef4444' // red for end
      })
        .setLngLat([endLng, endLat])
        .setPopup(new mapboxgl.Popup().setHTML('<div class="text-sm font-medium">Uscita</div>'))
        .addTo(map.current);
    }

    // Add line between points if both exist
    if (startLat && startLng && endLat && endLng) {
      map.current.on('load', () => {
        if (!map.current) return;
        
        map.current.addSource('route', {
          'type': 'geojson',
          'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
              'type': 'LineString',
              'coordinates': [
                [startLng, startLat],
                [endLng, endLat]
              ]
            }
          }
        });

        map.current.addLayer({
          'id': 'route',
          'type': 'line',
          'source': 'route',
          'layout': {
            'line-join': 'round',
            'line-cap': 'round'
          },
          'paint': {
            'line-color': 'hsl(var(--primary))',
            'line-width': 3,
            'line-opacity': 0.7
          }
        });
      });
    }

    // Cleanup
    return () => {
      map.current?.remove();
    };
  }, [startLat, startLng, endLat, endLng]);

  const hasLocations = (startLat && startLng) || (endLat && endLng);

  if (!hasLocations) {
    return (
      <div 
        className={`flex items-center justify-center bg-muted text-muted-foreground text-sm rounded-md ${className}`}
        style={{ height }}
      >
        Nessuna posizione GPS
      </div>
    );
  }

  return (
    <div 
      ref={mapContainer} 
      className={`rounded-md border ${className}`}
      style={{ height }}
    />
  );
};

export default MapView;