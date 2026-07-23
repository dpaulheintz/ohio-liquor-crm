'use client';

import { useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  GOLD, fmtMoney, fmtInt, mondayOf, shiftDay, dowOf, DOW_NAMES, DOW_SHORT, weekLabel,
} from '../lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface AnomalyDaily {
  date: string;         // YYYY-MM-DD
  revenue: number;
  labor: number;
  covers: number;
  invoiceSpend: number;
}

type MetricKey = 'revenue' | 'labor' | 'covers' | 'invoiceSpend';

const METRICS: Record<MetricKey, { label: string; fmt: (n: number) => string; noun: string }> = {
  revenue: { label: 'Revenue', fmt: fmtMoney, noun: 'Revenue' },
  labor: { label: 'Labor', fmt: fmtMoney, noun: 'Labor cost' },
  covers: { label: 'Covers', fmt: (n) => fmtInt(n), noun: 'Covers' },
  invoiceSpend: { label: 'Invoice Spend', fmt: fmtMoney, noun: 'Invoice spend' },
};
const METRIC_ORDER: MetricKey[] = ['revenue', 'labor', 'covers', 'invoiceSpend'];

const MIN_SAMPLES = 4;   // need ≥4 prior same-DOW weeks to judge an anomaly
const SD_THRESHOLD = 1;  // flag when |actual − mean| > 1 SD

// ─── Stats ────────────────────────────────────────────────────────────────────

interface Baseline { mean: number; std: number; n: number; }

/** 8-week same-day-of-week baseline for `date` (weeks d−7 … d−56). */
function baselineFor(map: Map<string, number>, date: string): Baseline {
  const vals: number[] = [];
  for (let w = 1; w <= 8; w++) {
    const v = map.get(shiftDay(date, -7 * w));
    if (v != null) vals.push(v);
  }
  const n = vals.length;
  if (n === 0) return { mean: 0, std: 0, n: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, std: Math.sqrt(variance), n };
}

interface Anomaly {
  metric: MetricKey;
  date: string;
  actual: number;
  mean: number;
  std: number;
  z: number;               // signed z-score
  direction: 'up' | 'down';
  pctDiff: number;         // vs mean
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AnomaliesClient({ daily, dataThrough }: { daily: AnomalyDaily[]; dataThrough: string | null }) {
  const [metric, setMetric] = useState<MetricKey>('revenue');

  // Per-metric date→value maps.
  const maps = useMemo(() => {
    const m: Record<MetricKey, Map<string, number>> = {
      revenue: new Map(), labor: new Map(), covers: new Map(), invoiceSpend: new Map(),
    };
    for (const d of daily) {
      m.revenue.set(d.date, d.revenue);
      m.labor.set(d.date, d.labor);
      m.covers.set(d.date, d.covers);
      m.invoiceSpend.set(d.date, d.invoiceSpend);
    }
    return m;
  }, [daily]);

  // Last full Mon–Sun week (the current week is partial).
  const lastFullWeek = useMemo(() => {
    if (!dataThrough) return null;
    const monday = dowOf(dataThrough) === 0 ? mondayOf(dataThrough) : shiftDay(mondayOf(dataThrough), -7);
    return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i)); // Mon…Sun
  }, [dataThrough]);

  // Anomalies across all metrics for the last full week.
  const anomalies = useMemo(() => {
    if (!lastFullWeek) return [] as Anomaly[];
    const out: Anomaly[] = [];
    for (const mk of METRIC_ORDER) {
      const map = maps[mk];
      for (const date of lastFullWeek) {
        const actual = map.get(date);
        if (actual == null) continue;
        const { mean, std, n } = baselineFor(map, date);
        if (n < MIN_SAMPLES || std <= 0) continue;
        const z = (actual - mean) / std;
        if (Math.abs(z) > SD_THRESHOLD) {
          out.push({
            metric: mk, date, actual, mean, std, z,
            direction: z > 0 ? 'up' : 'down',
            pctDiff: mean > 0 ? ((actual - mean) / mean) * 100 : 0,
          });
        }
      }
    }
    return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  }, [maps, lastFullWeek]);

  // 8-week daily chart series for the selected metric (ending last full week Sun).
  const chartData = useMemo(() => {
    if (!lastFullWeek) return [];
    const end = lastFullWeek[6];           // Sunday of last full week
    const start = shiftDay(end, -(8 * 7 - 1));
    const map = maps[metric];
    const anomSet = new Set(anomalies.filter((a) => a.metric === metric).map((a) => a.date));
    const out: Array<{
      date: string; label: string; value: number | null;
      avg: number | null; lower: number | null; band: number | null;
      anomalyUp: number | null; anomalyDown: number | null;
    }> = [];
    for (let d = start; d <= end; d = shiftDay(d, 1)) {
      const value = map.get(d) ?? null;
      const { mean, std, n } = baselineFor(map, d);
      const hasBase = n >= MIN_SAMPLES && std > 0;
      const lower = hasBase ? Math.max(0, mean - std) : null;
      const upper = hasBase ? mean + std : null;
      const isAnom = anomSet.has(d) && value != null;
      out.push({
        date: d,
        label: `${DOW_SHORT[dowOf(d)]} ${weekLabel(d).split(' ')[1]}`,
        value,
        avg: hasBase ? mean : null,
        lower,
        band: hasBase && upper != null && lower != null ? upper - lower : null,
        anomalyUp: isAnom && value != null && mean != null && value > mean ? value : null,
        anomalyDown: isAnom && value != null && mean != null && value < mean ? value : null,
      });
    }
    return out;
  }, [maps, metric, anomalies, lastFullWeek]);

  // Summary table (Revenue / Labor / Covers) for the last full week.
  const summary = useMemo(() => {
    if (!lastFullWeek) return [];
    const cols: MetricKey[] = ['revenue', 'labor', 'covers'];
    const anomKey = new Set(anomalies.map((a) => `${a.metric}|${a.date}`));
    return lastFullWeek.map((date) => {
      const cells = cols.map((mk) => {
        const actual = maps[mk].get(date) ?? null;
        const { mean, n } = baselineFor(maps[mk], date);
        const avg = n >= MIN_SAMPLES ? mean : null;
        const diff = actual != null && avg != null ? actual - avg : null;
        const isAnom = anomKey.has(`${mk}|${date}`);
        const dir: 'up' | 'down' | null = isAnom && diff != null ? (diff > 0 ? 'up' : 'down') : null;
        return { metric: mk, actual, avg, diff, dir };
      });
      return { date, cells };
    });
  }, [maps, anomalies, lastFullWeek]);

  const weekRangeLabel = lastFullWeek
    ? `${weekLabel(lastFullWeek[0])} – ${weekLabel(lastFullWeek[6])}`
    : '';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-primary/15 px-6 py-5">
        <Link href="/admin/restaurant-analytics" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Restaurant Analytics
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">Weekly Anomalies</h1>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
              High Bank Distillery — Unusual activity vs. 8-week baseline
            </p>
          </div>
          {weekRangeLabel && (
            <span className="text-xs text-muted-foreground font-mono">Last full week: {weekRangeLabel}</span>
          )}
        </div>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-screen-2xl mx-auto">
        {/* Feed */}
        <section>
          <h2 className="font-serif text-base font-semibold text-foreground mb-3">Anomaly Feed</h2>
          {anomalies.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2" style={{ color: '#10b981' }} />
              <p className="text-sm font-medium text-foreground">No unusual activity detected last week</p>
              <p className="text-xs text-muted-foreground mt-1">
                Every day&apos;s revenue, labor, covers, and invoice spend stayed within one standard deviation of the 8-week average.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {anomalies.map((a) => {
                const up = a.direction === 'up';
                const color = up ? '#ef4444' : '#3b82f6';
                const Icon = up ? TrendingUp : TrendingDown;
                const cfg = METRICS[a.metric];
                return (
                  <div key={`${a.metric}|${a.date}`} className="rounded-xl border bg-card p-4 flex gap-3" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full shrink-0" style={{ background: `${color}1f` }}>
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {cfg.noun} {up ? 'spiked' : 'dropped'} on {DOW_NAMES[dowOf(a.date)]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cfg.fmt(a.actual)} — {Math.abs(a.pctDiff).toFixed(0)}% {up ? 'above' : 'below'} the 8-week average of {cfg.fmt(a.mean)}
                        <span className="text-muted-foreground/70"> ({a.z > 0 ? '+' : ''}{a.z.toFixed(1)} SD)</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Chart */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-serif text-base font-semibold text-foreground">8-Week Trend</h2>
            <div className="flex items-center gap-1 flex-wrap">
              {METRIC_ORDER.map((mk) => (
                <button
                  key={mk}
                  onClick={() => setMetric(mk)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    metric === mk ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {METRICS[mk].label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2 flex-wrap">
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: GOLD }} />{METRICS[metric].label}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-slate-400" />8-wk rolling avg</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-300" />±1 SD band</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#ef4444' }} />Spike</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#3b82f6' }} />Drop</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
                <YAxis tickFormatter={(v) => METRICS[metric].fmt(v as number)} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={54} />
                <Tooltip content={(p) => <AnomalyTip active={p.active} payload={p.payload as []} label={String(p.label)} metric={metric} />} />
                {/* Shaded ±1 SD band: transparent base at `lower`, band height stacked on top. */}
                <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} connectNulls={false} />
                <Area dataKey="band" stackId="band" stroke="none" fill="#94a3b8" fillOpacity={0.18} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="avg" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="value" stroke={GOLD} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="anomalyUp" stroke="none" isAnimationActive={false} dot={{ r: 4, fill: '#ef4444', stroke: '#fff', strokeWidth: 1 }} />
                <Line dataKey="anomalyDown" stroke="none" isAnimationActive={false} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 1 }} />
                <ReferenceLine x={chartData.find((d) => d.date === lastFullWeek?.[0])?.label} stroke="#00000022" strokeDasharray="2 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Summary table */}
        <section>
          <h2 className="font-serif text-base font-semibold text-foreground mb-3">This Week vs. Rolling Average</h2>
          <div className="overflow-x-auto rounded-lg border border">
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-muted border-b border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground" rowSpan={2}>Day</th>
                  {(['revenue', 'labor', 'covers'] as MetricKey[]).map((mk) => (
                    <th key={mk} className="px-3 py-1.5 text-center text-xs font-medium text-muted-foreground border-l border" colSpan={3}>
                      {METRICS[mk].label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-muted border-b border text-[10px] text-muted-foreground">
                  {(['revenue', 'labor', 'covers'] as MetricKey[]).map((mk) => (
                    <Fragment key={mk}>
                      <th className="px-3 py-1.5 text-right font-medium border-l border">Actual</th>
                      <th className="px-3 py-1.5 text-right font-medium">Avg</th>
                      <th className="px-3 py-1.5 text-right font-medium">Diff</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.date} className="border-b border/50 hover:bg-white/40 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">
                      {DOW_SHORT[dowOf(row.date)]} {weekLabel(row.date).split(' ')[1]}
                    </td>
                    {row.cells.map((c) => {
                      const cfg = METRICS[c.metric];
                      const diffColor = c.dir === 'up' ? '#ef4444' : c.dir === 'down' ? '#3b82f6' : undefined;
                      const bg = c.dir === 'up' ? '#ef444414' : c.dir === 'down' ? '#3b82f614' : undefined;
                      return (
                        <Fragment key={c.metric}>
                          <td className="px-3 py-2.5 text-right font-mono text-foreground border-l border" style={{ background: bg }}>
                            {c.actual != null ? cfg.fmt(c.actual) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-muted-foreground" style={{ background: bg }}>
                            {c.avg != null ? cfg.fmt(c.avg) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ background: bg, color: diffColor ?? 'var(--muted-foreground, #71717a)' }}>
                            {c.diff != null ? `${c.diff >= 0 ? '+' : '−'}${cfg.fmt(Math.abs(c.diff))}` : '—'}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Cells shaded when the day is more than one standard deviation from its 8-week same-weekday average
            (<span style={{ color: '#ef4444' }}>red</span> = above, <span style={{ color: '#3b82f6' }}>blue</span> = below).
            A baseline needs at least {MIN_SAMPLES} prior weeks; days without enough history show “—”.
          </p>
        </section>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AnomalyTip({ active, payload, label, metric }: { active?: boolean; payload?: any[]; label?: string; metric: MetricKey }) {
  if (!active || !payload?.length) return null;
  const fmt = METRICS[metric].fmt;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = payload[0]?.payload as any;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <p className="text-white/60 mb-1 font-medium border-b border-zinc-700 pb-1">{label}</p>
      <p className="flex justify-between gap-3"><span className="text-white/70">{METRICS[metric].label}</span><span className="font-mono text-white">{row.value != null ? fmt(row.value) : '—'}</span></p>
      <p className="flex justify-between gap-3"><span className="text-white/70">8-wk avg</span><span className="font-mono text-white">{row.avg != null ? fmt(row.avg) : '—'}</span></p>
    </div>
  );
}
