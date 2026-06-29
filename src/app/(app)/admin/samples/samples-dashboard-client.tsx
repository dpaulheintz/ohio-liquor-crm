'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  LabelList,
} from 'recharts';
import type { SamplePullRow } from '@/app/actions/samples';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';
const SPIRIT_COLOR = '#C5A572';
const SWAG_COLOR = '#3b82f6';
const CATEGORY_COLORS = ['#C5A572', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4'];
const SWAG_CAT_COLORS: Record<string, string> = {
  'Crewnecks': '#3b82f6',
  'T-Shirts': '#22c55e',
  'Hoodies / Zip Ups': '#8b5cf6',
  'Long Sleeves': '#06b6d4',
  'Golf Polos': '#f97316',
  'Hats & Beanies': '#ec4899',
  'Jerseys': '#eab308',
  'Drinkware': '#C5A572',
  'Misc': '#6b7280',
};

type PullTypeFilter = 'all' | 'spirits' | 'swag';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function eachMonth(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground shrink-0">{num}</span>
      <h2 className="font-serif text-base font-semibold text-foreground tracking-wide">{title}</h2>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, rgba(200,16,46,0.2), transparent)` }} />
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border bg-card px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold leading-none" style={{ color: color ?? undefined }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">
            {(p.value ?? 0).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SamplesDashboardClientProps {
  pulls: SamplePullRow[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SamplesDashboardClient({ pulls }: SamplesDashboardClientProps) {
  // Filters
  const now = new Date();
  const defaultFrom = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const defaultTo = toDateStr(now);

  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [pullType, setPullType] = useState<PullTypeFilter>('all');
  const [personFilter, setPersonFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // All unique persons and categories
  const allPersons = useMemo(() => [...new Set(pulls.map(p => p.person_name))].sort(), [pulls]);
  const allCategories = useMemo(() => [...new Set(pulls.map(p => p.category))].sort(), [pulls]);

  // Filtered pulls
  const filtered = useMemo(() => {
    const from = dateFrom + 'T00:00:00';
    const to = dateTo + 'T23:59:59';
    return pulls.filter(p => {
      if (p.created_at < from || p.created_at > to) return false;
      if (pullType !== 'all' && p.pull_type !== pullType) return false;
      if (personFilter && p.person_name !== personFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      return true;
    });
  }, [pulls, dateFrom, dateTo, pullType, personFilter, categoryFilter]);

  // Compute prior period for % change
  const daySpan = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000) + 1);
  const priorFrom = toDateStr(new Date(new Date(dateFrom).getTime() - daySpan * 86_400_000));
  const priorTo = toDateStr(new Date(new Date(dateFrom).getTime() - 86_400_000));

  const priorFiltered = useMemo(() => {
    const from = priorFrom + 'T00:00:00';
    const to = priorTo + 'T23:59:59';
    return pulls.filter(p => {
      if (p.created_at < from || p.created_at > to) return false;
      if (pullType !== 'all' && p.pull_type !== pullType) return false;
      if (personFilter && p.person_name !== personFilter) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      return true;
    });
  }, [pulls, priorFrom, priorTo, pullType, personFilter, categoryFilter]);

  // ── Section 1: Overview ───────────────────────────────────────────────────
  const overview = useMemo(() => {
    const spiritPulls = filtered.filter(p => p.pull_type === 'spirits');
    const swagPulls = filtered.filter(p => p.pull_type === 'swag');
    const spiritBottles = spiritPulls.reduce((s, p) => s + p.items.reduce((si, i) => si + i.quantity, 0), 0);
    const swagItems = swagPulls.reduce((s, p) => s + p.items.reduce((si, i) => si + i.quantity, 0), 0);

    const priorSpiritPulls = priorFiltered.filter(p => p.pull_type === 'spirits');
    const priorSwagPulls = priorFiltered.filter(p => p.pull_type === 'swag');
    const priorSpiritBottles = priorSpiritPulls.reduce((s, p) => s + p.items.reduce((si, i) => si + i.quantity, 0), 0);
    const priorSwagItems = priorSwagPulls.reduce((s, p) => s + p.items.reduce((si, i) => si + i.quantity, 0), 0);

    function pctChange(cur: number, prior: number): string | null {
      if (prior === 0) return cur > 0 ? '+100%' : null;
      const pct = ((cur - prior) / prior) * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
    }

    return {
      spiritPulls: spiritPulls.length,
      spiritBottles,
      swagPulls: swagPulls.length,
      swagItems,
      spiritPullsPct: pctChange(spiritPulls.length, priorSpiritPulls.length),
      spiritBottlesPct: pctChange(spiritBottles, priorSpiritBottles),
      swagPullsPct: pctChange(swagPulls.length, priorSwagPulls.length),
      swagItemsPct: pctChange(swagItems, priorSwagItems),
    };
  }, [filtered, priorFiltered]);

  // ── Section 2: Spirits breakdown ──────────────────────────────────────────
  const spiritPulls = useMemo(() => filtered.filter(p => p.pull_type === 'spirits'), [filtered]);

  const spiritRanked = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of spiritPulls) for (const i of p.items) map.set(i.item_name, (map.get(i.item_name) ?? 0) + i.quantity);
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [spiritPulls]);

  const spiritByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of spiritPulls) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [spiritPulls]);

  const spiritTopPullers = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of spiritPulls) for (const i of p.items) map.set(p.person_name, (map.get(p.person_name) ?? 0) + i.quantity);
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [spiritPulls]);

  const spiritMonthly = useMemo(() => {
    if (spiritPulls.length === 0) return [];
    const map = new Map<string, number>();
    for (const p of spiritPulls) {
      const ym = p.created_at.slice(0, 7);
      for (const i of p.items) map.set(ym, (map.get(ym) ?? 0) + i.quantity);
    }
    const months = [...map.keys()].sort();
    const all = eachMonth(months[0], months[months.length - 1]);
    return all.map(ym => ({ month: fmtMonthLabel(ym), bottles: map.get(ym) ?? 0 }));
  }, [spiritPulls]);

  // ── Section 3: Swag breakdown ─────────────────────────────────────────────
  const swagPulls = useMemo(() => filtered.filter(p => p.pull_type === 'swag'), [filtered]);

  const swagRanked = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of swagPulls) for (const i of p.items) map.set(i.item_name, (map.get(i.item_name) ?? 0) + i.quantity);
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 15);
  }, [swagPulls]);

  const swagByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of swagPulls) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [swagPulls]);

  const swagTopPullers = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of swagPulls) for (const i of p.items) map.set(p.person_name, (map.get(p.person_name) ?? 0) + i.quantity);
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [swagPulls]);

  const swagByItemCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of swagPulls) for (const i of p.items) {
      const cat = i.item_category || 'Other';
      map.set(cat, (map.get(cat) ?? 0) + i.quantity);
    }
    return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);
  }, [swagPulls]);

  const swagMonthly = useMemo(() => {
    if (swagPulls.length === 0) return [];
    const map = new Map<string, number>();
    for (const p of swagPulls) {
      const ym = p.created_at.slice(0, 7);
      for (const i of p.items) map.set(ym, (map.get(ym) ?? 0) + i.quantity);
    }
    const months = [...map.keys()].sort();
    const all = eachMonth(months[0], months[months.length - 1]);
    return all.map(ym => ({ month: fmtMonthLabel(ym), items: map.get(ym) ?? 0 }));
  }, [swagPulls]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ['Date', 'Type', 'Person', 'Category', 'Account', 'Item', 'Size', 'Qty', 'Notes'].join(',');
    const rows = filtered.flatMap(p =>
      p.items.map(i => [
        new Date(p.created_at).toISOString().slice(0, 16),
        p.pull_type,
        `"${p.person_name}"`,
        p.category,
        p.account_name ? `"${p.account_name}"` : '',
        `"${i.item_name}"`,
        i.size ?? '',
        i.quantity,
        p.notes ? `"${p.notes.replace(/"/g, '""')}"` : '',
      ].join(','))
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sample-pulls-${dateFrom}-to-${dateTo}.csv`;
    a.click();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border px-6 py-5">
        <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">Samples Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
          Spirit &amp; Swag Pull Tracking
        </p>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-30 border-b border bg-background/95 backdrop-blur-sm px-6 py-3 flex flex-wrap gap-4 items-center">
        {/* Date range */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="text-muted-foreground uppercase tracking-wider">Range</span>
          <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)}
            className="bg-white border border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)}
            className="bg-white border border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60" />
        </div>

        {/* Pull type */}
        <div className="flex items-center gap-1 rounded-lg bg-white border border p-0.5">
          {(['all', 'spirits', 'swag'] as PullTypeFilter[]).map(t => (
            <button key={t} onClick={() => setPullType(t)}
              className={`rounded px-3 py-1 text-xs capitalize transition-colors ${
                pullType === t ? 'bg-primary text-white font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}>{t}</button>
          ))}
        </div>

        {/* Person filter */}
        <select value={personFilter} onChange={e => setPersonFilter(e.target.value)}
          className="bg-white border border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60">
          <option value="">All People</option>
          {allPersons.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Category filter */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="bg-white border border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60">
          <option value="">All Categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-screen-2xl mx-auto">
        {/* ── Section 1: Overview ────────────────────────────────────────────── */}
        <section>
          <SectionHeader num="01" title="Overview" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Spirit Pulls" value={overview.spiritPulls} color={SPIRIT_COLOR}
              sub={overview.spiritPullsPct ? `${overview.spiritPullsPct} vs prior period` : 'vs prior period'} />
            <KpiCard label="Spirit Bottles" value={overview.spiritBottles} color={SPIRIT_COLOR}
              sub={overview.spiritBottlesPct ? `${overview.spiritBottlesPct} vs prior period` : 'vs prior period'} />
            <KpiCard label="Swag Pulls" value={overview.swagPulls} color={SWAG_COLOR}
              sub={overview.swagPullsPct ? `${overview.swagPullsPct} vs prior period` : 'vs prior period'} />
            <KpiCard label="Swag Items" value={overview.swagItems} color={SWAG_COLOR}
              sub={overview.swagItemsPct ? `${overview.swagItemsPct} vs prior period` : 'vs prior period'} />
          </div>
        </section>

        {/* ── Section 2: Spirits Breakdown ───────────────────────────────────── */}
        {(pullType === 'all' || pullType === 'spirits') && (
          <section>
            <SectionHeader num="02" title="Spirits Breakdown" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Most Pulled Spirits */}
                <div className="lg:col-span-2 rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
                    Most Pulled Spirits
                  </h3>
                  {spiritRanked.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground text-sm">No spirit data in range.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(160, spiritRanked.length * 36)}>
                      <BarChart data={spiritRanked} layout="vertical" margin={{ top: 0, right: 60, bottom: 0, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: '#a1a1aa', fontSize: 10 }} axisLine={false} tickLine={false} width={180} />
                        <Tooltip content={props => <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />} />
                        <Bar dataKey="qty" name="Bottles" fill={GOLD} fillOpacity={0.85} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                          <LabelList dataKey="qty" position="right" style={{ fill: '#a1a1aa', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Pulls by Category (donut) */}
                <div className="rounded-xl border border bg-card p-4 flex flex-col">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">Pulls by Category</h3>
                  {spiritByCat.length === 0 ? (
                    <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No data</p>
                  ) : (
                    <>
                      <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 160 }}>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={spiritByCat} dataKey="value" nameKey="name" cx="50%" cy="50%"
                              innerRadius={46} outerRadius={68} paddingAngle={2} startAngle={90} endAngle={-270}>
                              {spiritByCat.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} fillOpacity={0.9} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1C1C1C', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11, color: '#fff' }}
                              itemStyle={{ color: '#e4e4e7' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-base font-bold text-foreground font-serif">{spiritPulls.length}</span>
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">pulls</span>
                        </div>
                      </div>
                      <div className="space-y-1 mt-2">
                        {spiritByCat.map(({ name, value }, i) => (
                          <div key={name} className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                            <span className="flex-1 truncate text-muted-foreground">{name}</span>
                            <span className="font-mono text-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Pullers */}
                <div className="rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">Top Spirit Pullers</h3>
                  {spiritTopPullers.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">No data</p>
                  ) : (
                    <div className="space-y-1.5">
                      {spiritTopPullers.map(({ name, qty }, i) => (
                        <div key={name} className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground font-mono w-5 text-right">{i + 1}</span>
                          <span className="flex-1 text-foreground">{name}</span>
                          <span className="font-mono text-muted-foreground">{qty} bottles</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Monthly Trend */}
                <div className="rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">Monthly Spirit Bottles</h3>
                  {spiritMonthly.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={spiritMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip content={props => <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />} />
                        <Line dataKey="bottles" name="Bottles" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: GOLD }} activeDot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Section 3: Swag Breakdown ──────────────────────────────────────── */}
        {(pullType === 'all' || pullType === 'swag') && (
          <section>
            <SectionHeader num="03" title="Swag Breakdown" />
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Most Pulled Swag */}
                <div className="lg:col-span-2 rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
                    Most Pulled Swag Items
                  </h3>
                  {swagRanked.length === 0 ? (
                    <p className="py-8 text-center text-muted-foreground text-sm">No swag data in range.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(160, swagRanked.length * 30)}>
                      <BarChart data={swagRanked} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: '#a1a1aa', fontSize: 9 }} axisLine={false} tickLine={false} width={260}
                          tickFormatter={(v: string) => v.length > 38 ? v.slice(0, 37) + '...' : v} />
                        <Tooltip content={props => <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />} />
                        <Bar dataKey="qty" name="Items" fill={SWAG_COLOR} fillOpacity={0.8} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                          <LabelList dataKey="qty" position="right" style={{ fill: '#a1a1aa', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Pulls by Category */}
                <div className="rounded-xl border border bg-card p-4 flex flex-col">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">Pulls by Category</h3>
                  {swagByCat.length === 0 ? (
                    <p className="flex-1 flex items-center justify-center text-sm text-muted-foreground">No data</p>
                  ) : (
                    <>
                      <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 160 }}>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={swagByCat} dataKey="value" nameKey="name" cx="50%" cy="50%"
                              innerRadius={46} outerRadius={68} paddingAngle={2} startAngle={90} endAngle={-270}>
                              {swagByCat.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} fillOpacity={0.9} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: '#1C1C1C', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11, color: '#fff' }}
                              itemStyle={{ color: '#e4e4e7' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-base font-bold text-foreground font-serif">{swagPulls.length}</span>
                          <span className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">pulls</span>
                        </div>
                      </div>
                      <div className="space-y-1 mt-2">
                        {swagByCat.map(({ name, value }, i) => (
                          <div key={name} className="flex items-center gap-2 text-xs">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                            <span className="flex-1 truncate text-muted-foreground">{name}</span>
                            <span className="font-mono text-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Top Pullers */}
                <div className="rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">Top Swag Pullers</h3>
                  {swagTopPullers.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">No data</p>
                  ) : (
                    <div className="space-y-1.5">
                      {swagTopPullers.map(({ name, qty }, i) => (
                        <div key={name} className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground font-mono w-5 text-right">{i + 1}</span>
                          <span className="flex-1 text-foreground">{name}</span>
                          <span className="font-mono text-muted-foreground">{qty} items</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Swag Category (bar) */}
                <div className="rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">By Swag Category</h3>
                  {swagByItemCat.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(120, swagByItemCat.length * 28)}>
                      <BarChart data={swagByItemCat} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: '#a1a1aa', fontSize: 9 }} axisLine={false} tickLine={false} width={120} />
                        <Bar dataKey="qty" name="Items" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                          {swagByItemCat.map((d) => (
                            <Cell key={d.name} fill={SWAG_CAT_COLORS[d.name] ?? '#94a3b8'} fillOpacity={0.8} />
                          ))}
                          <LabelList dataKey="qty" position="right" style={{ fill: '#a1a1aa', fontSize: 10 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Monthly Trend */}
                <div className="rounded-xl border border bg-card p-4">
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">Monthly Swag Items</h3>
                  {swagMonthly.length === 0 ? (
                    <p className="py-6 text-center text-muted-foreground text-sm">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={swagMonthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip content={props => <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />} />
                        <Line dataKey="items" name="Items" stroke={SWAG_COLOR} strokeWidth={2.5} dot={{ r: 3, fill: SWAG_COLOR }} activeDot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Section 4: Recent Activity Feed ────────────────────────────────── */}
        <section>
          <SectionHeader num="04" title="Recent Activity" />
          <div className="rounded-xl border border bg-card p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                Activity Feed ({filtered.length} pulls)
              </h3>
              <button onClick={exportCsv}
                className="rounded px-3 py-1 text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors shrink-0">
                Export CSV
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground text-sm">No pulls in this date range.</p>
            ) : (
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {filtered.map((p) => {
                  const isExpanded = expandedId === p.id;
                  const totalQty = p.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div key={p.id}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm" title={p.pull_type}>
                          {p.pull_type === 'spirits' ? '🥃' : '👕'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground font-medium truncate">
                            {p.person_name} <span className="text-muted-foreground">·</span>{' '}
                            <span className="text-muted-foreground">{p.category}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {p.items.map(i => `${i.item_name}${i.size ? ` (${i.size})` : ''} ×${i.quantity}`).join(', ')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono" style={{ color: p.pull_type === 'spirits' ? SPIRIT_COLOR : SWAG_COLOR }}>
                            {totalQty} {p.pull_type === 'spirits' ? 'btl' : 'itm'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(p.created_at)}</p>
                        </div>
                        <span className="text-muted-foreground text-xs">{isExpanded ? '▾' : '▸'}</span>
                      </button>
                      {isExpanded && (
                        <div className="px-10 pb-3 space-y-2 text-xs">
                          {p.account_name && (
                            <p className="text-muted-foreground"><span className="text-muted-foreground">Account:</span> {p.account_name}</p>
                          )}
                          <div className="rounded-lg border bg-muted/30 divide-y divide-border">
                            {p.items.map(i => (
                              <div key={i.id} className="flex items-center justify-between px-3 py-1.5">
                                <span className="text-foreground">{i.item_name}</span>
                                <span className="text-muted-foreground font-mono">
                                  {i.size ? `${i.size} · ` : ''}×{i.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                          {p.notes && (
                            <p className="text-muted-foreground italic">&ldquo;{p.notes}&rdquo;</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* QR Code links */}
        <section>
          <SectionHeader num="05" title="QR Code Links" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Spirit Sample Form', path: '/samples/spirits', emoji: '🥃' },
              { label: 'Swag Sample Form', path: '/samples/swag', emoji: '👕' },
            ].map(({ label, path, emoji }) => (
              <div key={path} className="rounded-xl border border bg-card p-5 flex flex-col items-center gap-3">
                <span className="text-3xl">{emoji}</span>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <a
                  href={path}
                  target="_blank"
                  rel="noopener"
                  className="text-xs font-mono text-primary underline underline-offset-2 break-all text-center"
                >
                  {typeof window !== 'undefined' ? window.location.origin : ''}{path}
                </a>
                <p className="text-[10px] text-muted-foreground text-center">
                  Print a QR code pointing to this URL and place it at the shelf
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
