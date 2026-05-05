'use client';

/**
 * Leaflet map component — loaded dynamically (SSR disabled).
 * Requires: npm install leaflet react-leaflet @types/leaflet
 */

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { MapTasting } from './tasting-map-view';
import { statusConfig, formatTime } from './tasting-utils';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Status → teardrop pin color
const STATUS_COLORS: Record<string, string> = {
  needs_staff: '#ef4444',
  scheduled: '#f59e0b',
  staffed: '#10b981',
  completed: '#6b7280',
  cancelled: '#d1d5db',
};

function createPinIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20c0-6.627-5.373-12-12-12z"
      fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -32],
  });
}

// Adjust map bounds when tastings change
function MapController({ tastings }: { tastings: MapTasting[] }) {
  const map = useMap();
  useEffect(() => {
    if (tastings.length === 0) return;
    if (tastings.length === 1) {
      map.setView([tastings[0].lat, tastings[0].lng], 13);
    } else {
      const bounds = L.latLngBounds(tastings.map((t) => [t.lat, t.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [tastings, map]);
  return null;
}

interface LeafletMapProps {
  tastings: MapTasting[];
  selected: MapTasting | null;
  onSelect: (t: MapTasting) => void;
}

export default function LeafletMap({ tastings, selected, onSelect }: LeafletMapProps) {
  // Ohio center
  const defaultCenter: [number, number] = [40.4173, -82.9071];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController tastings={tastings} />

      {tastings.map((t) => {
        const color = STATUS_COLORS[t.status] ?? '#6b7280';
        const icon = createPinIcon(
          selected?.id === t.id ? '#7c3aed' : color
        );
        const sc = statusConfig(t.status);

        return (
          <Marker
            key={t.id}
            position={[t.lat, t.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(t) }}
          >
            <Popup>
              <div style={{ minWidth: 160, fontSize: 12, lineHeight: 1.5 }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {t.agency?.display_name}
                </p>
                <p style={{ color: '#6b7280' }}>
                  {format(parseISO(t.date), 'MMM d, yyyy')}
                </p>
                <p style={{ color: '#6b7280' }}>
                  {formatTime(t.start_time)} – {formatTime(t.end_time)}
                </p>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium mt-1',
                    sc.className
                  )}
                >
                  {sc.label}
                </span>
                {t.staff_person && (
                  <p style={{ color: '#6b7280', marginTop: 2 }}>
                    {t.staff_person}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
