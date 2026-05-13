'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from 'recharts';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { KPI_OPTIONS } from '@/lib/types';
import { type KpiEventRow, type KpiDashboardData } from '@/app/actions/kpi';

// ─── Constants ────────────────────────────────────────────────────────────────

const KPI_COLORS: Record<string, string> = {
  Display: '#C5A572',
  Menu:    '#60a5fa',
  Feature: '#34d399',
  Event:   '#f472b6',
};

type DatePreset = '7d' | '30d' | '90d' | 'ytd' | 'all';

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Last 7d',  value: '7d'  },
  { label: 'Last 30d', value: '30d' },
  { label: 'Last 90d', value: '90d' },
  { label: 'YTD',      value: 'ytd' },
  { label: 'All Time', value: 'all' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPresetDates(preset: DatePreset): [string, string] {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  const sub = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days); return fmt(d); };
  switch (preset) {
    case '7d':  return [sub(6),   today];
    case '30d': return [sub(29),  today];
    case '90d': return [sub(89),  today];
    case 'ytd': return [`${now.getFullYear()}-01-01`, today];
    case 'all': return ['', ''];
  }
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDatetime(s: string) {
  return new Date(s).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function monthLabel(m: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [year, mo] = m.split('-');
  return `${months[parseInt(mo) - 1]} '${year.slice(2)}`;
}

function exportCsv(events: KpiEventRow[]) {
  const headers = ['Date', 'Rep', 'Account', 'KPI Type', 'Quantity', 'Photos', 'Notes'];
  const rows = events.map(e => [
    fmtDate(e.visited_at),
    e.rep_name || e.rep_email,
    e.account_name,
    e.kpi,
    String(e.kpi_quantity),
    String(e.photo_count),
    (e.notes ?? '').replace(/"/g, '""'),
  ]);
  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `kpi-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1a1a1a] p-2.5 shadow-xl text-xs min-w-[100px]">
      <p className="text-zinc-400 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? '#C5A572' }}>{p.name}</span>
          <span className="text-white font-mono">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Visit group (for table display) ─────────────────────────────────────────
interface VisitGroup {
  visit_id: string;
  visited_at: string;
  rep_id: string;
  rep_name: string | null;
  rep_email: string;
  account_id: string;
  account_name: string;
  notes: string | null;
  photo_count: number;
  kpis: KpiEventRow[]; // all KPI events for this visit (from filtered set)
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KpiDashboardClient({ kpiEvents, totalVisitCount }: KpiDashboardData) {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [preset, setPreset]               = useState<DatePreset>('all');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [repId, setRepId]                 = useState('all');
  const [kpiType, setKpiType]             = useState('all');
  const [accountSearch, setAccountSearch] = useState('');
  const [hasPhotos, setHasPhotos]         = useState(false);
  const [qtyGt1, setQtyGt1]               = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [showCharts, setShowCharts]       = useState(true);

  // ── Rep list from events ──────────────────────────────────────────────────
  const repList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const e of kpiEvents) {
      if (!seen.has(e.rep_id)) seen.set(e.rep_id, { id: e.rep_id, name: e.rep_name || e.rep_email });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [kpiEvents]);

  // ── Preset handler ────────────────────────────────────────────────────────
  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p);
    const [from, to] = getPresetDates(p);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  // ── Filtered events ───────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let result = kpiEvents;
    if (dateFrom)          result = result.filter(e => e.visited_at.slice(0, 10) >= dateFrom);
    if (dateTo)            result = result.filter(e => e.visited_at.slice(0, 10) <= dateTo);
    if (repId !== 'all')   result = result.filter(e => e.rep_id === repId);
    if (kpiType !== 'all') result = result.filter(e => e.kpi === kpiType);
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      result  = result.filter(e => e.account_name.toLowerCase().includes(q));
    }
    // hasPhotos + qtyGt1 are visit-level / event-level filters respectively
    return result;
  }, [kpiEvents, dateFrom, dateTo, repId, kpiType, accountSearch]);

  // ── Group filtered events by visit (for table) ────────────────────────────
  const visitGroups = useMemo(() => {
    const map = new Map<string, VisitGroup>();
    for (const e of filteredEvents) {
      if (!map.has(e.visit_id)) {
        map.set(e.visit_id, {
          visit_id:    e.visit_id,
          visited_at:  e.visited_at,
          rep_id:      e.rep_id,
          rep_name:    e.rep_name,
          rep_email:   e.rep_email,
          account_id:  e.account_id,
          account_name: e.account_name,
          notes:       e.notes,
          photo_count: e.photo_count,
          kpis:        [],
        });
      }
      map.get(e.visit_id)!.kpis.push(e);
    }
    return Array.from(map.values()).sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  }, [filteredEvents]);

  // Apply visit-level post-filters
  const visibleGroups = useMemo(() => {
    let g = visitGroups;
    if (hasPhotos) g = g.filter(v => v.photo_count > 0);
    if (qtyGt1)   g = g.filter(v => v.kpis.some(k => k.kpi_quantity > 1));
    return g;
  }, [visitGroups, hasPhotos, qtyGt1]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Use events from visibleGroups for consistency
  const visibleEvents = useMemo(() =>
    visibleGroups.flatMap(g => g.kpis),
    [visibleGroups]
  );

  const stats = useMemo(() => {
    const totalEvents = visibleEvents.length;
    const totalVisits = visibleGroups.length;
    const totalQty    = visibleEvents.reduce((s, e) => s + e.kpi_quantity, 0);
    const avgQty      = totalEvents > 0 ? totalQty / totalEvents : 0;

    const byType: Record<string, number> = {};
    KPI_OPTIONS.forEach(k => { byType[k] = 0; });
    for (const e of visibleEvents) byType[e.kpi] = (byType[e.kpi] ?? 0) + 1;
    const topType = [...KPI_OPTIONS].sort((a, b) => (byType[b] ?? 0) - (byType[a] ?? 0))[0] ?? KPI_OPTIONS[0];

    const byRep: Record<string, { name: string; count: number }> = {};
    for (const e of visibleEvents) {
      const name = e.rep_name || e.rep_email;
      if (!byRep[e.rep_id]) byRep[e.rep_id] = { name, count: 0 };
      byRep[e.rep_id].count++;
    }

    return { totalEvents, totalVisits, avgQty, byType, topType, byRep };
  }, [visibleEvents, visibleGroups]);

  // ── Prior period % ────────────────────────────────────────────────────────
  const priorPct = useMemo<number | null>(() => {
    if (!dateFrom || !dateTo) return null;
    const from  = new Date(dateFrom);
    const to    = new Date(dateTo);
    const days  = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const pFrom = new Date(from); pFrom.setDate(pFrom.getDate() - days);
    const pTo   = new Date(from); pTo.setDate(pTo.getDate() - 1);
    const pad   = (n: number) => String(n).padStart(2, '0');
    const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const prior = kpiEvents.filter(e => {
      const d = e.visited_at.slice(0, 10);
      return d >= fmt(pFrom) && d <= fmt(pTo);
    }).length;
    if (prior === 0) return null;
    return ((stats.totalEvents - prior) / prior) * 100;
  }, [kpiEvents, dateFrom, dateTo, stats.totalEvents]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const typeChartData = useMemo(() =>
    KPI_OPTIONS.map(k => ({ name: k, count: stats.byType[k] ?? 0, fill: KPI_COLORS[k] })),
    [stats.byType],
  );

  const repChartData = useMemo(() =>
    Object.values(stats.byRep)
      .sort((a, b) => b.count - a.count).slice(0, 10)
      .map(r => ({ name: r.name.split(' ')[0], fullName: r.name, count: r.count })),
    [stats.byRep],
  );

  const trendData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const e of visibleEvents) {
      const m = e.visited_at.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
      .map(([m, count]) => ({ month: monthLabel(m), count }));
  }, [visibleEvents]);

  const qtyDistData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const e of visibleEvents) {
      counts[e.kpi_quantity] = (counts[e.kpi_quantity] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([qty, count]) => ({ qty: `×${qty}`, count }))
      .sort((a, b) => parseInt(a.qty.slice(1)) - parseInt(b.qty.slice(1)));
  }, [visibleEvents]);

  // ── Total KPI visits (all time, for coverage card) ────────────────────────
  const totalKpiVisits = useMemo(() => new Set(kpiEvents.map(e => e.visit_id)).size, [kpiEvents]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">KPI Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {kpiEvents.length.toLocaleString()} KPI events across{' '}
              {totalKpiVisits.toLocaleString()} visits ·{' '}
              {totalVisitCount.toLocaleString()} total visits
            </p>
          </div>
          <button
            onClick={() => exportCsv(visibleEvents)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────── */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          {/* Date presets */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  preset === p.value
                    ? 'bg-[#C5A572] text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPreset('all'); }}
                className="h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]"
              />
              <span className="text-zinc-600 text-xs">→</span>
              <input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPreset('all'); }}
                className="h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]"
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={repId} onChange={e => setRepId(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[150px]">
              <option value="all">All Reps</option>
              {repList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>

            <select value={kpiType} onChange={e => setKpiType(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]">
              <option value="all">All Types</option>
              {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>

            <input type="text" placeholder="Search account…" value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2.5 text-xs text-zinc-300 w-[160px] placeholder-zinc-600"
            />

            <button onClick={() => setHasPhotos(h => !h)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                hasPhotos ? 'bg-[#C5A572]/15 text-[#C5A572] border-[#C5A572]/40' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'
              }`}>
              <Camera className="h-3 w-3" /> Has Photos
            </button>

            <button onClick={() => setQtyGt1(q => !q)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                qtyGt1 ? 'bg-[#C5A572]/15 text-[#C5A572] border-[#C5A572]/40' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'
              }`}>
              Qty &gt; 1
            </button>

            <span className="text-xs text-zinc-600 ml-auto">
              {visibleGroups.length.toLocaleString()} visits · {visibleEvents.length.toLocaleString()} KPI events
            </span>
          </div>
        </div>

        {/* ── Stat Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">KPI Events</p>
            <p className="text-3xl font-bold tabular-nums">{stats.totalEvents.toLocaleString()}</p>
            {priorPct != null ? (
              <p className={`text-xs mt-1.5 font-medium ${priorPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priorPct >= 0 ? '▲' : '▼'} {Math.abs(priorPct).toFixed(1)}% vs prior
              </p>
            ) : (
              <p className="text-xs mt-1.5 text-zinc-600">{stats.totalVisits} visits</p>
            )}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">KPI Coverage</p>
            <p className="text-3xl font-bold tabular-nums">
              {totalVisitCount > 0 ? ((totalKpiVisits / totalVisitCount) * 100).toFixed(0) : '0'}%
            </p>
            <p className="text-xs mt-1.5 text-zinc-600">
              {totalKpiVisits} of {totalVisitCount} visits
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">Avg Quantity</p>
            <p className="text-3xl font-bold tabular-nums">{stats.avgQty.toFixed(1)}</p>
            <p className="text-xs mt-1.5 text-zinc-600">per KPI event</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">Top KPI Type</p>
            <p className="text-2xl font-bold" style={{ color: KPI_COLORS[stats.topType] ?? '#fff' }}>
              {stats.totalEvents > 0 ? stats.topType : '—'}
            </p>
            <p className="text-xs mt-1.5 text-zinc-600">
              {stats.totalEvents > 0 ? `${stats.byType[stats.topType] ?? 0} events` : 'No data'}
            </p>
          </div>
        </div>

        {/* ── Charts ───────────────────────────────────────────────────── */}
        <div>
          <button onClick={() => setShowCharts(c => !c)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-3 transition-colors">
            {showCharts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Charts</span>
          </button>

          {showCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By Type */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">KPI Events by Type</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart layout="vertical" data={typeChartData} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                    <Bar dataKey="count" name="Events" radius={[0, 3, 3, 0]} maxBarSize={24}>
                      {typeChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* By Rep */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">KPI Events by Rep</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={repChartData} margin={{ top: 0, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                    <Bar dataKey="count" name="Events" fill="#C5A572" radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Trend */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">Monthly Trend</p>
                {trendData.length < 2 ? (
                  <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">Not enough data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line dataKey="count" name="Events" stroke="#C5A572" strokeWidth={2}
                        dot={{ fill: '#C5A572', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Qty Distribution */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">Quantity Distribution</p>
                {qtyDistData.length === 0 ? (
                  <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={qtyDistData} margin={{ top: 0, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis dataKey="qty" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                      <Bar dataKey="count" name="Events" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── KPI Visits Table ──────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-300">KPI Visits</p>
            <p className="text-xs text-zinc-600">{visibleGroups.length.toLocaleString()} visits</p>
          </div>

          {/* Desktop column header */}
          <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-zinc-800/60 text-xs text-zinc-600 font-medium uppercase tracking-wide">
            <span /><span>Date</span><span>Rep · Account</span><span>KPIs</span><span className="text-right pr-1">Photos</span>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {visibleGroups.length === 0 ? (
              <div className="py-12 text-center text-zinc-600 text-sm">No visits match the current filters</div>
            ) : (
              visibleGroups.slice(0, 200).map(group => {
                const isExpanded = expandedId === group.visit_id;

                return (
                  <div key={group.visit_id}>
                    <button
                      className="w-full text-left px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : group.visit_id)}
                    >
                      {/* Mobile */}
                      <div className="md:hidden space-y-1">
                        <div className="flex items-center gap-2 flex-wrap pl-5">
                          <span className="text-zinc-600 -ml-5">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          {group.kpis.map(k => {
                            const color = KPI_COLORS[k.kpi] ?? '#888';
                            return (
                              <span key={k.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                {k.kpi}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
                              </span>
                            );
                          })}
                          {group.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                              <Camera className="h-3 w-3" />{group.photo_count}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm pl-5">
                          <span className="font-medium text-zinc-200">{group.rep_name || group.rep_email}</span>
                          <span className="text-zinc-600">@</span>
                          <span className="text-zinc-400 truncate">{group.account_name}</span>
                        </div>
                        <p className="text-xs text-zinc-600 pl-5">{fmtDate(group.visited_at)}</p>
                      </div>

                      {/* Desktop */}
                      <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 items-start">
                        <span className="text-zinc-600 mt-0.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-xs text-zinc-500 mt-0.5 whitespace-nowrap">{fmtDate(group.visited_at)}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-zinc-200 block truncate">{group.rep_name || group.rep_email}</span>
                          <span className="text-xs text-zinc-500 truncate block">@ {group.account_name}</span>
                        </div>
                        {/* KPI badges */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {group.kpis.map(k => {
                            const color = KPI_COLORS[k.kpi] ?? '#888';
                            return (
                              <span key={k.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                                style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                {k.kpi}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
                              </span>
                            );
                          })}
                        </div>
                        <div className="text-right">
                          {group.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                              <Camera className="h-3 w-3" />{group.photo_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded */}
                    {isExpanded && (
                      <div className="px-4 md:pl-[148px] pb-4 pt-2 bg-black/20 border-t border-zinc-800/40">
                        <div className="space-y-3">
                          {/* All KPIs for this visit */}
                          <div>
                            <p className="text-xs text-zinc-600 uppercase tracking-wide mb-1.5">KPIs</p>
                            <div className="flex flex-wrap gap-2">
                              {group.kpis.map(k => {
                                const color = KPI_COLORS[k.kpi] ?? '#888';
                                return (
                                  <div key={k.id} className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                                      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                      {k.kpi}
                                    </span>
                                    {k.kpi_quantity > 1 && (
                                      <span className="text-xs font-bold text-white bg-white/10 px-1.5 py-0.5 rounded">×{k.kpi_quantity}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {group.notes && (
                            <div>
                              <p className="text-xs text-zinc-600 uppercase tracking-wide mb-1">Notes</p>
                              <p className="text-sm text-zinc-200 leading-relaxed">{group.notes}</p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-600">
                            <span>Photos: <span className="text-zinc-300">{group.photo_count}</span></span>
                            <span>Visited: <span className="text-zinc-300">{fmtDatetime(group.visited_at)}</span></span>
                          </div>

                          <Link href={`/accounts/${group.account_id}`}
                            className="inline-flex items-center gap-1 text-xs text-[#C5A572] hover:underline"
                            onClick={e => e.stopPropagation()}>
                            View account <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {visibleGroups.length > 200 && (
            <div className="px-4 py-3 border-t border-zinc-800 text-center">
              <p className="text-xs text-zinc-600">
                Showing first 200 of {visibleGroups.length.toLocaleString()} visits. Use filters or export CSV for full data.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
