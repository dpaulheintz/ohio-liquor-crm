'use client';

import { GOLD, fmtMoney, fmtCheck, fmtInt, fmtPct } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface KpiData {
  totalRevenue: number;
  priorRevenue: number | null;
  guestCount: number;
  priorGuestCount: number | null;
  avgCheck: number;
  fnbRevenue: number;
  retailRevenue: number; // total − fnb (retail_revenue column is unpopulated)
}

// ─── YoY badge ────────────────────────────────────────────────────────────────

function yoy(cur: number, prior: number | null): { label: string; up: boolean } | null {
  if (prior == null || prior === 0) return null;
  const delta = ((cur - prior) / prior) * 100;
  return { label: `${fmtPct(delta)} vs last year`, up: delta >= 0 };
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({
  label, value, badge, sub, children,
}: {
  label: string;
  value?: string;
  badge?: { label: string; up: boolean } | null;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      {value && (
        <span className="text-3xl font-serif font-bold text-foreground leading-none">{value}</span>
      )}
      {badge && (
        <span className={`text-xs font-mono ${badge.up ? 'text-emerald-500' : 'text-red-500'}`}>
          {badge.label}
        </span>
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      {children}
    </div>
  );
}

// ─── F&B vs Retail mini split bar ─────────────────────────────────────────────

function SplitBar({ fnb, retail }: { fnb: number; retail: number }) {
  const total = fnb + retail;
  const fnbPct = total > 0 ? (fnb / total) * 100 : 0;
  const retailPct = 100 - fnbPct;
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${fnbPct}%`, background: GOLD }} />
        <div style={{ width: `${retailPct}%`, background: '#94a3b8' }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: GOLD }} />
          <span className="text-muted-foreground">F&amp;B</span>
          <span className="font-mono text-foreground">{fmtMoney(fnb)}</span>
          <span className="text-muted-foreground">({fnbPct.toFixed(0)}%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: '#94a3b8' }} />
          <span className="text-muted-foreground">Retail</span>
          <span className="font-mono text-foreground">{fmtMoney(retail)}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function KpiCards({ data }: { data: KpiData }) {
  const revBadge = yoy(data.totalRevenue, data.priorRevenue);
  const guestBadge = yoy(data.guestCount, data.priorGuestCount);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        label="Total Revenue"
        value={fmtMoney(data.totalRevenue)}
        badge={revBadge}
        sub={data.priorRevenue == null ? 'No prior-year comparison' : undefined}
      />
      <Card
        label="Guest Count"
        value={fmtInt(data.guestCount)}
        badge={guestBadge}
        sub={data.priorGuestCount == null ? 'No prior-year comparison' : undefined}
      />
      <Card
        label="Avg Check"
        value={data.guestCount > 0 ? fmtCheck(data.avgCheck) : '—'}
        sub="Revenue ÷ guests"
      />
      <Card label="F&B vs Retail">
        <SplitBar fnb={data.fnbRevenue} retail={data.retailRevenue} />
      </Card>
    </div>
  );
}
