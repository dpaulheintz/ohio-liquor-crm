'use client';

import { useEffect, useState, useCallback } from 'react';
import { getVisits } from '@/app/actions/visits';
import { getReps } from '@/app/actions/accounts';
import { VisitLog, Profile } from '@/lib/types';
import { EditVisitDialog } from './visits/edit-visit-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, ChevronDown } from 'lucide-react';
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

export default function HomePage() {
  const [visits, setVisits] = useState<VisitLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState<string>('all');
  const [reps, setReps] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([]);
  const [page, setPage] = useState(1);
  const [editingVisit, setEditingVisit] = useState<VisitLog | null>(null);
  const pageSize = 20;

  const fetchVisits = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getVisits({
        repId: repFilter !== 'all' ? repFilter : undefined,
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
  }, [repFilter, page]);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  useEffect(() => {
    getReps().then(setReps);
  }, []);

  const hasMore = visits.length < total;
  const grouped = groupVisits(visits);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Feed</h1>
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
          <p>No visits logged yet</p>
          <p className="text-sm mt-1">
            Tap the + button to log your first visit
          </p>
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
