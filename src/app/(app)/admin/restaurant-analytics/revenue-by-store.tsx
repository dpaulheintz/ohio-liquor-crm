'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  LOCATIONS, LOCATION_COLORS, fmtMoney, fmtMoneyShort, fmtCheck, fmtInt, fmtPct,
  monthLabelYear, ymOf, shiftMonth, monthsBetween,
  type DailyRow, type LocationName,
} from './lib';

// ─── Period math ────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year';
const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; };
const dayCount = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

interface Ranges {
  cur: [string, string];
  prev: [string, string];
  ly: [string, string];
  prevLabel: string;
  lyLabel: string;
}

// All three windows are "to-date" (same number of days into the period) so
// current partial periods compare fairly against prior ones.
function computeRanges(period: Period, todayStr: string): Ranges {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  if (period === 'week') {
    const dow = today.getUTCDay();
    const back = dow === 0 ? 6 : dow - 1;              // days since Monday
    const curStart = addDays(today, -back);
    return {
      cur: [iso(curStart), todayStr],
      prev: [iso(addDays(curStart, -7)), iso(addDays(today, -7))],
      ly: [iso(addDays(curStart, -364)), iso(addDays(today, -364))],
      prevLabel: 'vs last week', lyLabel: 'vs same week last yr',
    };
  }
  if (period === 'month') {
    const curStart = new Date(Date.UTC(y, m, 1));
    const off = dayCount(iso(curStart), todayStr);
    const prevStart = new Date(Date.UTC(y, m - 1, 1));
    const lyStart = new Date(Date.UTC(y - 1, m, 1));
    return {
      cur: [iso(curStart), todayStr],
      prev: [iso(prevStart), iso(addDays(prevStart, off))],
      ly: [iso(lyStart), iso(addDays(lyStart, off))],
      prevLabel: 'vs last month', lyLabel: 'vs same month last yr',
    };
  }
  if (period === 'quarter') {
    const q = Math.floor(m / 3);
    const curStart = new Date(Date.UTC(y, q * 3, 1));
    const off = dayCount(iso(curStart), todayStr);
    const prevStart = new Date(Date.UTC(y, q * 3 - 3, 1));
    const lyStart = new Date(Date.UTC(y - 1, q * 3, 1));
    return {
      cur: [iso(curStart), todayStr],
      prev: [iso(prevStart), iso(addDays(prevStart, off))],
      ly: [iso(lyStart), iso(addDays(lyStart, off))],
      prevLabel: 'vs last quarter', lyLabel: 'vs same qtr last yr',
    };
  }
  // year
  const curStart = new Date(Date.UTC(y, 0, 1));
  const off = dayCount(iso(curStart), todayStr);
  const lyStart = new Date(Date.UTC(y - 1, 0, 1));
  return {
    cur: [iso(curStart), todayStr],
    prev: [iso(lyStart), iso(addDays(lyStart, off))],
    ly: [iso(lyStart), iso(addDays(lyStart, off))],
    prevLabel: 'vs last year', lyLabel: 'vs same period last yr',
  };
}

// ─── Aggregation ────────────────────────────────────────────────────────────

interface LocAgg { revenue: number; guests: number; }
function aggregate(rows: DailyRow[], loc: LocationName, [start, end]: [string, string]): LocAgg {
  let revenue = 0, guests = 0;
  for (const r of rows) {
    if (r.location !== loc) continue;
    if (r.date < start || r.date > end) continue;
    revenue += r.total; guests += r.guests;
  }
  return { revenue, guests };
}

function delta(cur: number, base: number): number | null {
  if (base <= 0) return null;
  return ((cur - base) / base) * 100;
}

// ─── Sortable table ───────────────────────────────────────────────────────────

type SortKey = 'location' | 'revenue' | 'guests' | 'avgCheck';

function SortableHeader({
  label, col, sortKey, dir, onSort, align = 'right',
}: {
  label: string; col: SortKey; sortKey: SortKey; dir: 'asc' | 'desc';
  onSort: (c: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RevenueByStore({ rows, dataThrough }: { rows: DailyRow[]; dataThrough: string | null }) {
  const [period, setPeriod] = useState<Period>('month');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const today = dataThrough ?? rows.reduce((mx, r) => (r.date > mx ? r.date : mx), rows[0]?.date ?? '');

  const ranges = useMemo(() => computeRanges(period, today), [period, today]);

  // Per-location current/prev/ly aggregates + avg check.
  const cards = useMemo(() => LOCATIONS.map((loc) => {
    const cur = aggregate(rows, loc, ranges.cur);
    const prev = aggregate(rows, loc, ranges.prev);
    const ly = aggregate(rows, loc, ranges.ly);
    return {
      location: loc,
      revenue: cur.revenue,
      guests: cur.guests,
      avgCheck: cur.guests > 0 ? cur.revenue / cur.guests : 0,
      prevDelta: delta(cur.revenue, prev.revenue),
      lyDelta: delta(cur.revenue, ly.revenue),
    };
  }), [rows, ranges]);

  const tableRows = useMemo(() => {
    const copy = [...cards];
    copy.sort((a, b) => {
      let av: number | string, bv: number | string;
      switch (sortKey) {
        case 'location': av = a.location; bv = b.location; break;
        case 'guests': av = a.guests; bv = b.guests; break;
        case 'avgCheck': av = a.avgCheck; bv = b.avgCheck; break;
        default: av = a.revenue; bv = b.revenue;
      }
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [cards, sortKey, dir]);

  const totals = useMemo(() => cards.reduce(
    (s, c) => ({ revenue: s.revenue + c.revenue, guests: s.guests + c.guests }),
    { revenue: 0, guests: 0 },
  ), [cards]);

  // Stacked monthly bar — last 12 months, one segment per location (always monthly).
  const stacked = useMemo(() => {
    const latest = ymOf(today || '2026-01-01');
    const start = shiftMonth(latest, -11);
    const months = monthsBetween(start, latest);
    const byMonthLoc: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const ym = ymOf(r.date);
      (byMonthLoc[ym] ??= {})[r.location] = (byMonthLoc[ym]?.[r.location] ?? 0) + r.total;
    }
    return months.map((ym) => {
      const row: Record<string, number | string> = { label: monthLabelYear(ym) };
      for (const loc of LOCATIONS) row[loc] = byMonthLoc[ym]?.[loc] ?? 0;
      return row;
    });
  }, [rows, today]);

  const onSort = (c: SortKey) => {
    if (c === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(c); setDir(c === 'location' ? 'asc' : 'desc'); }
  };

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex items-center gap-1 flex-wrap">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              period === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Per-location cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.location} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOCATION_COLORS[c.location] }} />
              <span className="font-serif text-base font-semibold text-foreground">{c.location}</span>
            </div>
            <span className="text-2xl font-serif font-bold leading-none text-foreground">{fmtMoney(c.revenue)}</span>
            <div className="flex flex-col gap-1 text-xs pt-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{ranges.prevLabel}</span>
                <DeltaBadge v={c.prevDelta} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{ranges.lyLabel}</span>
                <DeltaBadge v={c.lyDelta} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stacked monthly bar */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">Monthly Revenue by Location (last 12 months)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stacked} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} />
            <YAxis tickFormatter={(v) => fmtMoneyShort(v as number)} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: '#00000008' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={(p: any) => {
                if (!p.active || !p.payload?.length) return null;
                const total = p.payload.reduce((s: number, x: { value: number }) => s + (x.value ?? 0), 0);
                return (
                  <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[170px]">
                    <p className="text-white/60 mb-1 font-medium border-b border-zinc-700 pb-1">{p.label}</p>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {[...p.payload].reverse().map((x: any) => (
                      <p key={x.name} className="flex justify-between gap-3">
                        <span style={{ color: x.color }}>{x.name}</span>
                        <span className="font-mono text-white">{fmtMoney(x.value)}</span>
                      </p>
                    ))}
                    <p className="flex justify-between gap-3 border-t border-zinc-700 mt-1 pt-1">
                      <span className="text-white/70">Total</span>
                      <span className="font-mono font-semibold text-white">{fmtMoney(total)}</span>
                    </p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {LOCATIONS.map((loc) => (
              <Bar key={loc} dataKey={loc} stackId="rev" fill={LOCATION_COLORS[loc]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sortable performance table */}
      <div className="overflow-x-auto rounded-lg border border">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-muted border-b border">
              <SortableHeader label="Location" col="location" sortKey={sortKey} dir={dir} onSort={onSort} align="left" />
              <SortableHeader label="Revenue" col="revenue" sortKey={sortKey} dir={dir} onSort={onSort} />
              <SortableHeader label="Covers" col="guests" sortKey={sortKey} dir={dir} onSort={onSort} />
              <SortableHeader label="Avg Check" col="avgCheck" sortKey={sortKey} dir={dir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.location} className="border-b border/50 hover:bg-white/40 transition-colors">
                <td className="px-3 py-2.5 font-medium text-foreground">{r.location}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">{fmtMoney(r.revenue)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtInt(r.guests)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.guests > 0 ? fmtCheck(r.avgCheck) : '—'}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-primary/30 bg-card font-semibold">
              <td className="px-3 py-2.5 text-foreground">All Locations</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtMoney(totals.revenue)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtInt(totals.guests)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.guests > 0 ? fmtCheck(totals.revenue / totals.guests) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaBadge({ v }: { v: number | null }) {
  if (v == null) return <span className="font-mono text-muted-foreground">—</span>;
  const up = v >= 0;
  return (
    <span className="font-mono font-semibold" style={{ color: up ? '#10b981' : '#ef4444' }}>
      {fmtPct(v)}
    </span>
  );
}
