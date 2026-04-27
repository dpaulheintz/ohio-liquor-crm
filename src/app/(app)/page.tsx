'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { startOfWeek, startOfMonth } from 'date-fns';
import { getVisits } from '@/app/actions/visits';
import { getReps } from '@/app/actions/accounts';
import { VisitLog, Profile } from '@/lib/types';
import { EditVisitDialog } from './visits/edit-visit-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, ChevronDown, X } from 'lucide-react';
import { VisitCard } from './visits/visit-card';
import { getVisitGroup } from '@/lib/date-utils';

function groupVisits(visits: VisitLog[]): { label: string; visits: VisitLog[] }[] {
  const groups: Map<string, VisitLog[]> = new Map();
  for (const v of visits) {
    const label = getVisitGroup(v.visited_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(v);
  }
  return Array.from(groups.entries()).map(([label, visits]) => ({ label, visits }));
}

function periodDates(period: string | null): { startDate?: string; endDate?: string } {
  if (!period) return {};
  const now = new Date();
  if (period === 'week') {
    return { startDate: startOfWeek(now, { weekStartsOn: 0 }).toISOString() };
  }
  if (period === 'month') {
    return { startDate: startOfMonth(now).toISOString() };
  }
  return {};
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 rounded bg-muted animate-pulse" />
          <div className="h-9 w-36 rounded bg-muted animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </div>
    }>
      <ActivityFeed />
    </Suspense>
  );
}

function ActivityFeed() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const period = searchParams.get('period'); // 'week' | 'month' | null
  const kpiOnly = searchParams.get('kpi') === 'true';

  const [visits, setVisits] = useState<VisitLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState<string>('all');
  const [reps, setReps] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([]);
  const [page, setPage] = useState(1);
  const [editingVisit, setEditingVisit] = useState<VisitLog | null>(null);
  const pageSize = 20;

  const { startDate, endDate } = periodDates(period);

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getVisits({
        repId: repFilter !== 'all' ? repFilter : undefined,
        startDate,
        endDate,
        kpiOnly: kpiOnly || undefined,
        page,
        pageSize,
      });
      if (page === 1) {
        setVisits(result.visits);
      } else {
        setVisits((prev) => [...prev, ...result.visits]);
      }
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch visits:', err);
    } finally {
      setLoading(false);
    }
  }, [repFilter, startDate, endDate, kpiOnly, page]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    getReps().then(setReps);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setVisits([]);
  }, [period, kpiOnly, repFilter]);

  function clearFilter() {
    router.replace('/');
  }

  const hasMore = visits.length < total;
  const grouped = groupVisits(visits);

  const filterLabel = period === 'week'
    ? kpiOnly ? 'KPIs · This Week' : 'This Week'
    : period === 'month'
    ? kpiOnly ? 'KPIs · This Month' : 'This Month'
    : kpiOnly ? 'KPIs Only'
    : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Activity Feed</h1>
          {filterLabel && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {filterLabel}
              <button onClick={clearFilter} className="hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
        <Select
          value={repFilter}
          onValueChange={(v) => {
            setRepFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Reps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reps</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.full_name || r.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && page === 1 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <ClipboardList className="mx-auto mb-3 h-10 w-10" />
          {filterLabel ? (
            <>
              <p>No visits found for &quot;{filterLabel}&quot;</p>
              <button onClick={clearFilter} className="text-sm mt-2 underline hover:text-foreground">
                Clear filter
              </button>
            </>
          ) : (
            <>
              <p>No visits logged yet</p>
              <p className="text-sm mt-1">Tap the + button to log your first visit</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, visits: groupVisits }) => (
            <div key={label} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
                {label}
              </h2>
              {groupVisits.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onClick={() => setEditingVisit(visit)}
                />
              ))}
            </div>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={loading}
              >
                <ChevronDown className="mr-1 h-4 w-4" />
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      <EditVisitDialog
        visit={editingVisit}
        open={!!editingVisit}
        onOpenChange={(open) => { if (!open) setEditingVisit(null); }}
        onSuccess={() => { setPage(1); fetchVisits(); }}
      />
    </div>
  );
}
