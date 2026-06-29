'use client';

import { TrendingUp, TrendingDown, Minus, Star, Calendar } from 'lucide-react';

export interface YtdStats {
  current: number;
  ly: number;
  twoLY: number;
}

interface OverviewProps {
  revenue: YtdStats;
  bottles: YtdStats;
  bestMonth: { month: string; value: number } | null;
  lastUpdated: string | null;
}

function pct(a: number, b: number) {
  if (!b) return null;
  return ((a - b) / b) * 100;
}

function fmtDollar(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtMonth(m: string) {
  const d = new Date(m + '-01');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function ChangeChip({ val }: { val: number | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = val >= 0;
  const Icon = val === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${
        val === 0
          ? 'bg-muted text-muted-foreground'
          : positive
          ? 'bg-emerald-950 text-emerald-400'
          : 'bg-red-950 text-red-400'
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(val).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  formatter,
  stats,
  delay,
}: {
  label: string;
  value: number;
  formatter: (n: number) => string;
  stats: YtdStats;
  delay: number;
}) {
  const vsLY = pct(stats.current, stats.ly);
  const vs2LY = pct(stats.current, stats.twoLY);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-5 flex flex-col gap-3 opacity-0 animate-[fadeSlideIn_0.5s_ease_forwards]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Gold top accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A572] to-transparent" />

      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>

      <p className="text-3xl font-bold text-foreground tracking-tight">
        {formatter(value)}
      </p>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          vs LY <ChangeChip val={vsLY} />
          <span className="text-muted-foreground">{formatter(stats.ly)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          vs 2LY <ChangeChip val={vs2LY} />
          <span className="text-muted-foreground">{formatter(stats.twoLY)}</span>
        </span>
      </div>
    </div>
  );
}

export function RevenueOverview({ revenue, bottles, bestMonth, lastUpdated }: OverviewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <KpiCard
        label="YTD Revenue"
        value={revenue.current}
        formatter={fmtDollar}
        stats={revenue}
        delay={0}
      />
      <KpiCard
        label="YTD Bottles Sold"
        value={bottles.current}
        formatter={fmtNum}
        stats={bottles}
        delay={80}
      />

      {/* Best Month */}
      <div
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-5 flex flex-col gap-3 opacity-0 animate-[fadeSlideIn_0.5s_ease_forwards]"
        style={{ animationDelay: '160ms' }}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A572] to-transparent" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Best Month</p>
        {bestMonth ? (
          <>
            <p className="text-3xl font-bold text-foreground tracking-tight">{fmtDollar(bestMonth.value)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 text-primary" />
              {fmtMonth(bestMonth.month)}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No data</p>
        )}
      </div>

      {/* Last Updated */}
      <div
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-5 flex flex-col gap-3 opacity-0 animate-[fadeSlideIn_0.5s_ease_forwards]"
        style={{ animationDelay: '240ms' }}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A572] to-transparent" />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last Updated</p>
        {lastUpdated ? (
          <>
            <p className="text-3xl font-bold text-foreground tracking-tight">{fmtMonth(lastUpdated)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Most recent month loaded
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">No data loaded</p>
        )}
      </div>
    </div>
  );
}
