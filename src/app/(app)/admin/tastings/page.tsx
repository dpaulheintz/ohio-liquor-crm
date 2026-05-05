'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTastings, getTastingStats } from '@/app/actions/tastings';
import type { Tasting } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Activity,
  AlertCircle,
  CalendarDays,
  Trophy,
  Clock,
  LayoutList,
  Calendar,
  Map,
} from 'lucide-react';
import { TastingListView } from './tasting-list-view';
import { TastingCalendarView } from './tasting-calendar-view';
import { TastingMapView } from './tasting-map-view';
import { TastingFormDialog } from './tasting-form-dialog';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'calendar' | 'map';

type Stats = {
  upcoming: number;
  needsStaff: number;
  thisWeek: number;
  thisMonth: number;
  completed: number;
};

export default function TastingsPage() {
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [showCreate, setShowCreate] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        getTastings(),
        getTastingStats(),
      ]);
      setTastings(data as Tasting[]);
      setStats(s);
    } catch (err) {
      console.error('Failed to load tastings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading || !stats) return <TastingsSkeleton />;

  const statCards = [
    {
      label: 'Upcoming',
      value: stats.upcoming,
      icon: Activity,
      highlight: false,
    },
    {
      label: 'Needs Staff',
      value: stats.needsStaff,
      icon: AlertCircle,
      highlight: stats.needsStaff > 0,
    },
    {
      label: 'This Week',
      value: stats.thisWeek,
      icon: Clock,
      highlight: false,
    },
    {
      label: 'This Month',
      value: stats.thisMonth,
      icon: CalendarDays,
      highlight: false,
    },
    {
      label: 'Completed',
      value: stats.completed,
      icon: Trophy,
      highlight: false,
    },
  ];

  const viewButtons: { mode: ViewMode; icon: typeof LayoutList; label: string }[] = [
    { mode: 'list', icon: LayoutList, label: 'List' },
    { mode: 'calendar', icon: Calendar, label: 'Calendar' },
    { mode: 'map', icon: Map, label: 'Map' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tastings</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Tasting
        </Button>
      </div>

      {/* ===== Stats Cards ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(({ label, value, icon: Icon, highlight }) => (
          <Card
            key={label}
            className={cn(
              'hover:border-amber-400/60 transition-colors',
              highlight && 'border-red-400/50 dark:border-red-500/40'
            )}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {label}
              </p>
              <p
                className={cn(
                  'text-3xl font-bold mt-1',
                  highlight && 'text-red-500 dark:text-red-400'
                )}
              >
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ===== View Toggle ===== */}
      <div className="flex items-center">
        <div className="flex rounded-md border overflow-hidden">
          {viewButtons.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
                view === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== View Content ===== */}
      {view === 'list' && (
        <TastingListView tastings={tastings} onRefresh={fetchAll} />
      )}
      {view === 'calendar' && (
        <TastingCalendarView tastings={tastings} onRefresh={fetchAll} />
      )}
      {view === 'map' && (
        <TastingMapView tastings={tastings} />
      )}

      <TastingFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => { setShowCreate(false); fetchAll(); }}
      />
    </div>
  );
}

function TastingsSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-10" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
