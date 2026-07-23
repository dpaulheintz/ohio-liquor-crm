'use client';

import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { fmtMoney, primeCostColor, PRIME_BENCHMARK, PRIME_YELLOW_MAX } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface PrimePoint {
  label: string;
  prime: number | null;      // prime cost %
}

export interface PrimeCostData {
  weekly: PrimePoint[];       // last (up to) 12 complete weeks
  monthly: PrimePoint[];      // last (up to) 12 complete months
  // Latest complete month headline (breakdown of the prime cost dollars).
  headline: {
    periodLabel: string;
    prime: number | null;
    cogs: number;
    labor: number;
    revenue: number;
  } | null;
  hasData: boolean;
}

function pct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PrimeTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number | null | undefined;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-white/60 mb-1 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      <p className="flex justify-between gap-3">
        <span className="text-white/70">Prime cost</span>
        <span className="font-mono font-semibold" style={{ color: v == null ? '#fff' : primeCostColor(v) }}>
          {v == null ? '—' : `${v.toFixed(1)}%`}
        </span>
      </p>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LegendSwatch() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#10b981' }} />&lt;{PRIME_BENCHMARK}%</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#f59e0b' }} />{PRIME_BENCHMARK}–{PRIME_YELLOW_MAX}%</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#ef4444' }} />&gt;{PRIME_YELLOW_MAX}%</span>
      <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: '#ef4444' }} />Benchmark {PRIME_BENCHMARK}%</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PrimeCostPanel({ data }: { data: PrimeCostData }) {
  if (!data.hasData) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No invoice-based cost data for this location. Prime cost is available for
        Grandview, Gahanna, and Westerville (locations with MarginEdge invoices).
      </div>
    );
  }

  const h = data.headline;

  // Shared Y domain padding so both charts breathe around the benchmark line.
  const allVals = [...data.weekly, ...data.monthly].map((p) => p.prime).filter((v): v is number => v != null);
  const yMax = Math.max(PRIME_YELLOW_MAX + 5, ...allVals) + 3;
  const yMin = Math.max(0, Math.min(PRIME_BENCHMARK - 10, ...allVals) - 3);

  return (
    <div className="space-y-4">
      {/* Headline — latest complete month */}
      {h && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
              Prime Cost — {h.periodLabel}
            </span>
            <span className="text-3xl font-serif font-bold leading-none" style={{ color: primeCostColor(h.prime) }}>
              {pct(h.prime)}
            </span>
            <span className="text-xs text-muted-foreground">
              {h.prime == null ? 'Awaiting data'
                : h.prime < PRIME_BENCHMARK ? `Below ${PRIME_BENCHMARK}% benchmark`
                : h.prime <= PRIME_YELLOW_MAX ? `At the ${PRIME_BENCHMARK}–${PRIME_YELLOW_MAX}% caution band`
                : `Above ${PRIME_YELLOW_MAX}% — investigate`}
            </span>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">COGS (Invoices)</span>
            <span className="text-2xl font-serif font-bold leading-none text-foreground">{fmtMoney(h.cogs)}</span>
            <span className="text-xs text-muted-foreground">{h.revenue > 0 ? `${(h.cogs / h.revenue * 100).toFixed(1)}% of sales` : '—'}</span>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Labor</span>
            <span className="text-2xl font-serif font-bold leading-none text-foreground">{fmtMoney(h.labor)}</span>
            <span className="text-xs text-muted-foreground">{h.revenue > 0 ? `${(h.labor / h.revenue * 100).toFixed(1)}% of sales` : '—'}</span>
          </div>
          <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Revenue</span>
            <span className="text-2xl font-serif font-bold leading-none text-foreground">{fmtMoney(h.revenue)}</span>
            <span className="text-xs text-muted-foreground">Prime = (COGS + Labor) ÷ Revenue</span>
          </div>
        </div>
      )}

      {/* Methodology note */}
      <p className="text-[11px] text-muted-foreground -mt-1">
        <span className="text-foreground">Invoice-based:</span> COGS is the sum of MarginEdge invoices
        (food + beverage + unclassified) received in each period, from Monday 00:00 to Sunday 23:59 for weeks.
        Labor and revenue come from Toast. The current partial week/month is excluded so lumpy invoice timing
        doesn&apos;t distort the latest bar.
      </p>

      {/* 12-week line + 12-month bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Weekly line */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Last 12 Weeks</h3>
            <LegendSwatch />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.weekly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
              <YAxis domain={[yMin, yMax]} tickFormatter={(v) => `${v}%`} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={(p) => <PrimeTip active={p.active} payload={p.payload as []} label={String(p.label)} />} />
              <ReferenceLine y={PRIME_BENCHMARK} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `${PRIME_BENCHMARK}%`, position: 'right', fill: '#ef4444', fontSize: 10 }} />
              <Line dataKey="prime" stroke="#334155" strokeWidth={2} connectNulls isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload, index } = props as { cx: number; cy: number; payload: PrimePoint; index: number };
                  if (payload.prime == null) return <g key={index} />;
                  return <circle key={index} cx={cx} cy={cy} r={3.5} fill={primeCostColor(payload.prime)} stroke="#fff" strokeWidth={1} />;
                }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly bar */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Last 12 Months</h3>
            <LegendSwatch />
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
              <YAxis domain={[yMin, yMax]} tickFormatter={(v) => `${v}%`} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
              <Tooltip cursor={{ fill: '#00000008' }} content={(p) => <PrimeTip active={p.active} payload={p.payload as []} label={String(p.label)} />} />
              <ReferenceLine y={PRIME_BENCHMARK} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `${PRIME_BENCHMARK}%`, position: 'right', fill: '#ef4444', fontSize: 10 }} />
              <Bar dataKey="prime" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.monthly.map((p, i) => (
                  <Cell key={i} fill={primeCostColor(p.prime)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
