'use client';

/**
 * Map view — requires react-leaflet + leaflet.
 * Run `npm install leaflet react-leaflet @types/leaflet` if not already installed.
 *
 * Geocoding is done lazily via OpenStreetMap Nominatim (no API key needed).
 * Results are cached in component state for the session.
 */

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Tasting } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { statusConfig, formatTime } from './tasting-utils';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { MapPin, RefreshCw } from 'lucide-react';

// Types for geocode cache
interface GeoPoint {
  lat: number;
  lng: number;
}

type GeoCache = Record<string, GeoPoint | null>; // key = "address,city,state"

// ---- Geocoding via Nominatim ----
async function geocode(query: string): Promise<GeoPoint | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en-US', 'User-Agent': 'HighBankCRM/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function tastingGeoKey(t: Tasting): string {
  return [t.agency?.address ?? '', t.city ?? t.agency?.city ?? '', t.agency?.state ?? 'OH'].join(
    ','
  );
}

function tastingGeoQuery(t: Tasting): string {
  const parts = [
    t.agency?.address,
    t.city ?? t.agency?.city,
    t.agency?.state ?? 'OH',
    t.agency?.zip,
    'USA',
  ].filter(Boolean);
  if (parts.length < 2) return `${t.city ?? t.agency?.city ?? 'Columbus'}, OH, USA`;
  return parts.join(', ');
}

// ---- Dynamically-imported Leaflet map (SSR=false) ----
const LeafletMap = dynamic(
  () => import('./leaflet-map').catch(() => {
    // If leaflet is not installed, return a placeholder component
    return Promise.resolve({
      default: function NotInstalled() {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <MapPin className="h-8 w-8" />
            <p className="text-sm font-medium">Map library not installed</p>
            <p className="text-xs text-center max-w-xs">
              Run <code className="bg-muted px-1 rounded">npm install leaflet react-leaflet @types/leaflet</code> to enable the map view.
            </p>
          </div>
        );
      },
    });
  }),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-lg" /> }
);

interface TastingMapViewProps {
  tastings: Tasting[];
}

export interface MapTasting extends Tasting {
  lat: number;
  lng: number;
}

export function TastingMapView({ tastings }: TastingMapViewProps) {
  const [geoCache, setGeoCache] = useState<GeoCache>({});
  const [geocoding, setGeocoding] = useState(false);
  const [selected, setSelected] = useState<Tasting | null>(null);

  // Upcoming/active tastings only
  const upcomingTastings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tastings.filter(
      (t) =>
        t.date >= today && !['completed', 'cancelled'].includes(t.status)
    );
  }, [tastings]);

  async function runGeocoding() {
    if (geocoding) return;
    setGeocoding(true);

    const toGeocode = upcomingTastings.filter((t) => {
      const key = tastingGeoKey(t);
      return !(key in geoCache);
    });

    const results: GeoCache = {};
    // Geocode sequentially to respect Nominatim rate limit (1 req/sec)
    for (const t of toGeocode) {
      const key = tastingGeoKey(t);
      if (key in results) continue;
      const query = tastingGeoQuery(t);
      const point = await geocode(query);
      results[key] = point;
      await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max 1 req/s
    }

    setGeoCache((prev) => ({ ...prev, ...results }));
    setGeocoding(false);
  }

  // Auto-geocode on mount
  useEffect(() => {
    if (upcomingTastings.length > 0) runGeocoding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build geo-resolved tastings
  const mappedTastings = useMemo<MapTasting[]>(() => {
    return upcomingTastings
      .map((t) => {
        const pt = geoCache[tastingGeoKey(t)];
        if (!pt) return null;
        return { ...t, lat: pt.lat, lng: pt.lng };
      })
      .filter((t): t is MapTasting => t !== null);
  }, [upcomingTastings, geoCache]);

  const pendingCount = upcomingTastings.length - mappedTastings.length;

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {mappedTastings.length} upcoming tastings on map
          {pendingCount > 0 && ` (${pendingCount} locating…)`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={runGeocoding}
          disabled={geocoding}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-1', geocoding && 'animate-spin')} />
          {geocoding ? 'Locating…' : 'Re-locate'}
        </Button>
      </div>

      {/* Map container */}
      <div className="h-[500px] md:h-[600px] rounded-lg border overflow-hidden relative">
        <LeafletMap
          tastings={mappedTastings}
          selected={selected}
          onSelect={setSelected}
        />
      </div>

      {/* Selected tasting panel */}
      {selected && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold">{selected.agency?.display_name}</h3>
              <p className="text-sm text-muted-foreground">
                {format(parseISO(selected.date), 'EEEE, MMM d, yyyy')} ·{' '}
                {formatTime(selected.start_time)}–{formatTime(selected.end_time)}
              </p>
              {(selected.city ?? selected.agency?.city) && (
                <p className="text-sm text-muted-foreground">
                  {selected.city ?? selected.agency?.city}
                </p>
              )}
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                statusConfig(selected.status).className
              )}
            >
              {statusConfig(selected.status).label}
            </span>
          </div>
          {selected.staff_category && (
            <p className="text-sm">
              <span className="text-muted-foreground">Staff: </span>
              {selected.staff_category}
              {selected.staff_person ? ` — ${selected.staff_person}` : ''}
            </p>
          )}
          {selected.notes && (
            <p className="text-sm text-muted-foreground">{selected.notes}</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            Close
          </Button>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(['needs_staff', 'scheduled', 'staffed'] as const).map((s) => {
          const sc = statusConfig(s);
          return (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('h-2.5 w-2.5 rounded-full', sc.dotClass)} />
              {sc.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
