'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getBarrelPicks,
  getBarrelPickStats,
  type BarrelPick,
} from '@/app/actions/barrel-picks';
import { getReps } from '@/app/actions/accounts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Kanban,
  LayoutList,
  Calendar,
  Activity,
  Users,
  CalendarDays,
  Factory,
  DollarSign,
  Trophy,
} from 'lucide-react';
import { BarrelPickBoard } from './barrel-pick-board';
import { BarrelPickList } from './barrel-pick-list';
import { BarrelPickCalendar } from './barrel-pick-calendar';
import { BarrelPickFormDialog } from './barrel-pick-form';
import { BarrelPickDetail } from './barrel-pick-detail';
import { cn } from '@/lib/utils';

type ViewMode = 'board' | 'list' | 'calendar';

type Rep = { id: string; full_name: string | null; email: string };

type Stats = {
  active: number;
  prospects: number;
  upcomingPicks: number;
  inProduction: number;
  pipeline: number;
  ytdCompleted: number;
  ytdRevenue: number;
};

function fmt(n: number) {
  return n >= 1000
    ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`
    : `$${n.toLocaleString()}`;
}

export default function BarrelPicksPage() {
  const [picks, setPicks] = useState<BarrelPick[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('board');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s, r] = await Promise.all([
        getBarrelPicks(),
        getBarrelPickStats(),
        getReps(),
      ]);
      setPicks(data);
      setStats(s);
      setReps(r);
    } catch (err) {
      console.error('Failed to load barrel picks:', err);
      setStats({ active: 0, prospects: 0, upcomingPicks: 0, inProduction: 0, pipeline: 0, ytdCompleted: 0, ytdRevenue: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading || !stats) return <PageSkeleton />;

  const statCards = [
    { label: 'Active Picks', value: String(stats.active), icon: Activity },
    { label: 'Prospects', value: String(stats.prospects), icon: Users },
    { label: 'Upcoming Picks', value: String(stats.upcomingPicks), icon: CalendarDays },
    { label: 'In Production', value: String(stats.inProduction), icon: Factory },
    { label: 'Revenue Pipeline', value: fmt(stats.pipeline), icon: DollarSign, highlight: true },
    { label: 'YTD Completed', value: `${stats.ytdCompleted} / ${fmt(stats.ytdRevenue)}`, icon: Trophy },
  ];

  const viewButtons: { mode: ViewMode; icon: typeof Kanban; label: string }[] = [
    { mode: 'board', icon: Kanban, label: 'Board' },
    { mode: 'list', icon: LayoutList, label: 'List' },
    { mode: 'calendar', icon: Calendar, label: 'Calendar' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Barrel Picks</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Barrel Pick
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(({ label, value, icon: Icon, highlight }) => (
          <Card key={label} className={cn(
            'hover:border-amber-400/60 transition-colors',
            highlight && 'border-amber-400/50 dark:border-amber-500/40'
          )}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Icon className="h-3 w-3" /> {label}
              </p>
              <p className={cn('text-2xl font-bold mt-1', highlight && 'text-amber-600 dark:text-amber-400')}>
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

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

      {view === 'board' && (
        <BarrelPickBoard picks={picks} onRefresh={fetchAll} onSelect={setSelectedId} />
      )}
      {view === 'list' && (
        <BarrelPickList picks={picks} reps={reps} onRefresh={fetchAll} onSelect={setSelectedId} />
      )}
      {view === 'calendar' && (
        <BarrelPickCalendar picks={picks} onSelect={setSelectedId} />
      )}

      <BarrelPickFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        reps={reps}
        onSuccess={() => { setShowCreate(false); fetchAll(); }}
      />

      <BarrelPickDetail
        pickId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        reps={reps}
        onRefresh={fetchAll}
      />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </CardContent></Card>
        ))}
      </div>
      <Skeleton className="h-10 w-52" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
