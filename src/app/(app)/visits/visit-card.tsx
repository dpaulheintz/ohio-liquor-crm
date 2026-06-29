'use client';

import { useState } from 'react';
import { VisitLog, VisitKpi, VisitPhoto } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { formatVisitDate } from '@/lib/date-utils';
import { Phone, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface VisitCardProps {
  visit: VisitLog;
  showAccount?: boolean;
  onClick?: () => void;
}

// ─── KPI colours (matches KPI dashboard) ─────────────────────────────────────
const KPI_COLORS: Record<string, string> = {
  Display: '#C8102E',
  Menu:    '#60a5fa',
  Feature: '#34d399',
  Event:   '#f472b6',
};

// ─── Photo lightbox ───────────────────────────────────────────────────────────
function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: VisitPhoto[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const photo = photos[idx];

  function prev(e: React.MouseEvent) {
    e.stopPropagation();
    setIdx((i) => (i - 1 + photos.length) % photos.length);
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation();
    setIdx((i) => (i + 1) % photos.length);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/92"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Prev */}
      {photos.length > 1 && (
        <button
          onClick={prev}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <img
        src={photo.photo_url}
        alt={photo.caption || 'Visit photo'}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Caption + counter */}
      <div className="absolute bottom-4 left-0 right-0 text-center space-y-1">
        {photo.caption && (
          <p className="text-sm text-white/80">{photo.caption}</p>
        )}
        {photos.length > 1 && (
          <p className="text-xs text-white/50">
            {idx + 1} / {photos.length}
          </p>
        )}
      </div>

      {/* Next */}
      {photos.length > 1 && (
        <button
          onClick={next}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

// ─── KPI badge strip (standalone so it's not created during render) ───────────
function KpiBadges({ kpis }: { kpis: VisitKpi[] }) {
  if (kpis.length === 0) return null;
  if (kpis.length === 1) {
    const k     = kpis[0];
    const color = KPI_COLORS[k.kpi_type] ?? '#888';
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
        style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
      >
        {k.kpi_type}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {kpis.slice(0, 3).map((k) => {
        const color = KPI_COLORS[k.kpi_type] ?? '#888';
        return (
          <span
            key={k.id}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
          >
            {k.kpi_type}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
          </span>
        );
      })}
      {kpis.length > 3 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
          +{kpis.length - 3}
        </span>
      )}
    </div>
  );
}

// ─── VisitCard ─────────────────────────────────────────────────────────────────
export function VisitCard({ visit, showAccount = true, onClick }: VisitCardProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const rep     = visit.rep;
  const account = visit.account;
  const photos  = (visit.visit_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const kpis    = visit.visit_kpis ?? [];
  const isPhone = visit.visit_type === 'phone_call';

  const initials = rep?.full_name
    ? rep.full_name.split(' ').map((n) => n[0]).join('').toUpperCase()
    : '?';

  // ── Phone call card (compact) ───────────────────────────────────────────────
  if (isPhone) {
    return (
      <>
        <Card
          className={`border-dashed opacity-85 ${onClick ? 'cursor-pointer transition-colors hover:bg-muted/50' : ''}`}
          onClick={onClick}
        >
          <CardContent className="p-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {rep?.full_name || rep?.email || 'Unknown'}
                    </span>
                    {showAccount && account && (
                      <>
                        <span className="text-xs text-muted-foreground shrink-0">called</span>
                        <Link
                          href={`/accounts/${account.id}`}
                          className="text-sm font-medium text-primary hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {account.display_name}
                        </Link>
                      </>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatVisitDate(visit.visited_at)}
                  </span>
                </div>
                {visit.notes && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{visit.notes}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {lightboxIndex !== null && (
          <PhotoLightbox
            photos={photos}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </>
    );
  }

  // ── In-person card (full) ───────────────────────────────────────────────────
  return (
    <>
      <Card
        className={onClick ? 'cursor-pointer transition-colors hover:bg-muted/50' : ''}
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-medium">
                    {rep?.full_name || rep?.email || 'Unknown'}
                  </span>
                  {showAccount && account && (
                    <>
                      <span className="text-sm text-muted-foreground"> visited </span>
                      <Link
                        href={`/accounts/${account.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {account.display_name}
                      </Link>
                    </>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <KpiBadges kpis={kpis} />
                  <span className="text-[11px] text-muted-foreground">
                    {formatVisitDate(visit.visited_at)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {visit.notes && (
                <p className="text-sm text-foreground whitespace-pre-wrap">{visit.notes}</p>
              )}

              {/* Photos (tappable) */}
              {photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((photo, i) => (
                    <button
                      key={photo.id}
                      type="button"
                      className="shrink-0 focus:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxIndex(i);
                      }}
                    >
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || 'Visit photo'}
                        className="h-24 w-24 rounded-md object-cover hover:opacity-90 transition-opacity"
                      />
                      {photo.caption && (
                        <p className="mt-1 text-xs text-muted-foreground max-w-24 truncate">
                          {photo.caption}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
