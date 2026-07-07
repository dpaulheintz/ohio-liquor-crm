'use client';

import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { GOLD, fmtMoney, type LocationName } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface PrimeCostData {
  // period aggregates (combined over the selected location(s))
  revenue: number;
  labor: number;
  food: number;                 // purchase-based proxy
  foodAvailable: boolean;       // any daily_costs present in the period
  // monthly trend of prime cost %
  trend: Array<{ label: string; prime: number | null; food: number | null; labor: number | null }>;
  // current vs prior month vs same month last year (prime cost %)
  compare: { currentLabel: string; current: number | null; priorMonth: number | null; lastYear: number | null };
  // per-location breakdown (shown on All Locations)
  perLocation: Array<{ location: LocationName; prime: number | null; food: number | null; labor: number | null; revenue: number }>;
}

// Industry benchmarks
const PRIME_OK = 65;    // prime cost % — flag red above this
const FOOD_LOW = 28;    // food cost % healthy band
const FOOD_HIGH = 32;

function pct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

function primeColor(n: number | null): string {
  if (n == null) return 'var(--muted-foreground, #71717a)';
  return n > PRIME_OK ? '#ef4444' : '#10b981';
}

function foodColor(n: number | null): string {
  if (n == null) return 'var(--muted-foreground, #71717a)';
  if (n > FOOD_HIGH) return '#ef4444';
  if (n < FOOD_LOW) return '#f59e0b';
  return '#10b981';
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MetricTile({
  label, value, color, hint,
}: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold leading-none" style={{ color: color ?? 'inherit' }}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[150px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">{p.value != null ? `${p.value.toFixed(1)}%` : '—'}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PrimeCostPanel({ data }: { data: PrimeCostData }) {
  const primePct = data.revenue > 0 && data.foodAvailable ? ((data.labor + data.food) / data.revenue) * 100 : null;
  const foodPct = data.revenue > 0 && data.foodAvailable ? (data.food / data.revenue) * 100 : null;
  const laborPct = data.revenue > 0 ? (data.labor / data.revenue) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Headline metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="Prime Cost %"
          value={pct(primePct)}
          color={primeColor(primePct)}
          hint={primePct == null ? 'Awaiting cost data' : primePct > PRIME_OK ? 'Above 65% target' : 'Within 55–65% target'}
        />
        <MetricTile
          label="Food Cost % (purchases)"
          value={pct(foodPct)}
          color={foodColor(foodPct)}
          hint={foodPct == null ? 'Awaiting invoice data' : `Benchmark ${FOOD_LOW}–${FOOD_HIGH}%`}
        />
        <MetricTile label="Labor % of Sales" value={pct(laborPct)} hint="From Toast labor" />
        <MetricTile
          label="Prime Cost $"
          value={data.foodAvailable ? fmtMoney(data.labor + data.food) : '—'}
          hint={`Labor ${fmtMoney(data.labor)} + Food ${data.foodAvailable ? fmtMoney(data.food) : '—'}`}
        />
      </div>

      {/* Purchases-based disclaimer */}
      <p className="text-[11px] text-muted-foreground -mt-1">
        Food cost is a <span className="text-foreground">purchases-based proxy</span> from MarginEdge invoices (not true COGS —
        no inventory counts). Best read at monthly granularity.
      </p>

      {/* Prime cost trend + comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Trend chart */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Prime Cost % — Monthly Trend</h3>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: GOLD }} />Prime</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />Food</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data.trend} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              {/* Healthy prime-cost band 55–65% */}
              <ReferenceArea y1={55} y2={65} fill="#10b981" fillOpacity={0.06} />
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={(p) => <TrendTip active={p.active} payload={p.payload as []} label={String(p.label)} />} />
              <Line dataKey="prime" name="Prime" stroke={GOLD} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="food" name="Food" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Period comparison */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">Prime Cost — {data.compare.currentLabel}</h3>
          <div className="flex flex-col gap-3 flex-1 justify-center">
            {[
              { label: 'This month', v: data.compare.current },
              { label: 'Prior month', v: data.compare.priorMonth },
              { label: 'Same month last year', v: data.compare.lastYear },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="font-mono text-lg font-semibold" style={{ color: primeColor(r.v) }}>{pct(r.v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-location breakdown */}
      {data.perLocation.length > 1 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">By Location</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Location</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Prime %</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Food %</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Labor %</th>
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.perLocation.map((r) => (
                  <tr key={r.location}>
                    <td className="px-3 py-2.5 font-medium text-foreground">{r.location}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: primeColor(r.prime) }}>{pct(r.prime)}</td>
                    <td className="px-3 py-2.5 text-right font-mono" style={{ color: foodColor(r.food) }}>{pct(r.food)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{pct(r.labor)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{fmtMoney(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
