'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getPhotoAudit } from '@/app/actions/visits';
import { getReps } from '@/app/actions/accounts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Camera, ChevronDown, Filter } from 'lucide-react';
import { formatEST } from '@/lib/date-utils';
import { formatDistanceToNow } from 'date-fns';

interface AuditRep {
  id: string;
  full_name: string | null;
  email: string;
}

interface AuditPhoto {
  id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
}

interface AuditVisit {
  id: string;
  visited_at: string;
  notes: string | null;
  kpi: string | null;
  rep_id: string;
  account_id: string;
  rep: AuditRep | null;
  account: { id: string; display_name: string } | null;
  visit_photos: AuditPhoto[];
}

const PAGE_SIZE = 10;

export function PhotoAudit() {
  const [visits, setVisits] = useState<AuditVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [reps, setReps] = useState<AuditRep[]>([]);

  const [repFilter, setRepFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [lightbox, setLightbox] = useState<{ url: string; caption: string | null } | null>(null);

  useEffect(() => {
    getReps().then((r) => setReps(r as AuditRep[]));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPhotoAudit({
        repId: repFilter !== 'all' ? repFilter : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate
          ? new Date(endDate + 'T23:59:59').toISOString()
          : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      const data = (result.visits as unknown as AuditVisit[]) ?? [];
      if (page === 1) setVisits(data);
      else setVisits((prev) => [...prev, ...data]);
      setTotal(result.total);
    } catch (err) {
      console.error('Photo audit fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [repFilter, startDate, endDate, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function resetFilters() {
    setRepFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasMore = visits.length < total;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Camera className="h-4 w-4" /> Photo Audit
          {total > 0 && (
            <Badge variant="secondary" className="ml-1">
              {total}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rep</Label>
            <Select
              value={repFilter}
              onValueChange={(v) => {
                setRepFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.full_name || r.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetFilters}
            disabled={repFilter === 'all' && !startDate && !endDate}
          >
            <Filter className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </div>

        {/* List */}
        {loading && page === 1 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </p>
        ) : visits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No visits with photos match these filters
          </p>
        ) : (
          <div className="space-y-3">
            {visits.map((v) => (
              <div key={v.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm">
                    <span className="font-medium">
                      {v.rep?.full_name || v.rep?.email || 'Unknown rep'}
                    </span>
                    <span className="text-muted-foreground"> at </span>
                    <Link
                      href={`/accounts/${v.account?.id ?? v.account_id}`}
                      className="text-primary hover:underline"
                    >
                      {v.account?.display_name || 'Unknown account'}
                    </Link>
                  </div>
                  <span
                    className="text-xs text-muted-foreground"
                    title={
                      formatEST(v.visited_at, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }) + ' EST'
                    }
                  >
                    {formatDistanceToNow(new Date(v.visited_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {v.visit_photos
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setLightbox({ url: p.photo_url, caption: p.caption })
                        }
                        className="shrink-0 focus:outline-none focus:ring-2 focus:ring-primary rounded-md"
                      >
                        <img
                          src={p.photo_url}
                          alt={p.caption || 'Visit photo'}
                          className="h-20 w-20 rounded-md object-cover hover:opacity-90 transition-opacity"
                        />
                      </button>
                    ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="text-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={loading}
                >
                  <ChevronDown className="mr-1 h-4 w-4" />
                  {loading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Lightbox */}
        <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
          <DialogContent className="max-w-3xl p-2">
            {lightbox && (
              <div className="space-y-2">
                <img
                  src={lightbox.url}
                  alt={lightbox.caption || 'Visit photo'}
                  className="w-full max-h-[80vh] object-contain rounded-md"
                />
                {lightbox.caption && (
                  <p className="text-sm text-center text-muted-foreground">
                    {lightbox.caption}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
