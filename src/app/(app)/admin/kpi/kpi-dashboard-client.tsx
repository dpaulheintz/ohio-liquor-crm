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
import { type KpiVisitRow, type KpiDashboardData } from '@/app/actions/kpi';

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
  const d = new Date(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDatetime(s: string) {
  const d = new Date(s);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function monthLabel(m: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [year, mo] = m.split('-');
  return `${months[parseInt(mo) - 1]} '${year.slice(2)}`;
}

function exportCsv(visits: KpiVisitRow[]) {
  const headers = ['Date', 'Rep', 'Account', 'KPI Type', 'Quantity', 'Photos', 'Notes'];
  const rows = visits.map(v => [
    fmtDate(v.visited_at),
    v.rep_name || v.rep_email,
    v.account_name,
    v.kpi,
    String(v.kpi_quantity ?? 1),
    String(v.photo_count),
    (v.notes ?? '').replace(/"/g, '""'),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `kpi-report-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function KpiDashboardClient({ kpiVisits, totalVisitCount }: KpiDashboardData) {
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

  // ── Rep list (derived from visits) ────────────────────────────────────────
  const repList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const v of kpiVisits) {
      if (!seen.has(v.rep_id)) {
        seen.set(v.rep_id, { id: v.rep_id, name: v.rep_name || v.rep_email });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [kpiVisits]);

  // ── Preset handler ────────────────────────────────────────────────────────
  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p);
    const [from, to] = getPresetDates(p);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  // ── Filtered visits ───────────────────────────────────────────────────────
  const filteredVisits = useMemo(() => {
    let result = kpiVisits;
    if (dateFrom) result = result.filter(v => v.visited_at.slice(0, 10) >= dateFrom);
    if (dateTo)   result = result.filter(v => v.visited_at.slice(0, 10) <= dateTo);
    if (repId !== 'all')   result = result.filter(v => v.rep_id === repId);
    if (kpiType !== 'all') result = result.filter(v => v.kpi === kpiType);
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      result = result.filter(v => v.account_name.toLowerCase().includes(q));
    }
    if (hasPhotos) result = result.filter(v => v.photo_count > 0);
    if (qtyGt1)   result = result.filter(v => (v.kpi_quantity ?? 1) > 1);
    return result;
  }, [kpiVisits, dateFrom, dateTo, repId, kpiType, accountSearch, hasPhotos, qtyGt1]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total    = filteredVisits.length;
    const totalQty = filteredVisits.reduce((s, v) => s + (v.kpi_quantity ?? 1), 0);
    const avgQty   = total > 0 ? totalQty / total : 0;

    const byType: Record<string, number> = {};
    KPI_OPTIONS.forEach(k => { byType[k] = 0; });
    for (const v of filteredVisits) {
      byType[v.kpi] = (byType[v.kpi] ?? 0) + 1;
    }
    const topType = [...KPI_OPTIONS].sort((a, b) => (byType[b] ?? 0) - (byType[a] ?? 0))[0] ?? KPI_OPTIONS[0];

    const byRep: Record<string, { name: string; count: number }> = {};
    for (const v of filteredVisits) {
      const name = v.rep_name || v.rep_email || v.rep_id;
      if (!byRep[v.rep_id]) byRep[v.rep_id] = { name, count: 0 };
      byRep[v.rep_id].count++;
    }

    return { total, totalQty, avgQty, byType, topType, byRep };
  }, [filteredVisits]);

  // ── Prior-period % change ─────────────────────────────────────────────────
  const priorPct = useMemo<number | null>(() => {
    if (!dateFrom || !dateTo) return null;
    const from  = new Date(dateFrom);
    const to    = new Date(dateTo);
    const days  = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const pFrom = new Date(from); pFrom.setDate(pFrom.getDate() - days);
    const pTo   = new Date(from); pTo.setDate(pTo.getDate() - 1);
    const pad   = (n: number) => String(n).padStart(2, '0');
    const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const pFromStr = fmt(pFrom);
    const pToStr   = fmt(pTo);
    const prior = kpiVisits.filter(v => {
      const d = v.visited_at.slice(0, 10);
      return d >= pFromStr && d <= pToStr;
    }).length;
    if (prior === 0) return null;
    return ((stats.total - prior) / prior) * 100;
  }, [kpiVisits, dateFrom, dateTo, stats.total]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const typeChartData = useMemo(() =>
    KPI_OPTIONS.map(k => ({ name: k, count: stats.byType[k] ?? 0, fill: KPI_COLORS[k] })),
    [stats.byType],
  );

  const repChartData = useMemo(() =>
    Object.values(stats.byRep)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(r => ({ name: r.name.split(' ')[0], fullName: r.name, count: r.count })),
    [stats.byRep],
  );

  const trendData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const v of filteredVisits) {
      const m = v.visited_at.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, count]) => ({ month: monthLabel(m), count }));
  }, [filteredVisits]);

  const qtyDistData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const v of filteredVisits) {
      const qty = v.kpi_quantity ?? 1;
      counts[qty] = (counts[qty] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([qty, count]) => ({ qty: `×${qty}`, count }))
      .sort((a, b) => parseInt(a.qty.slice(1)) - parseInt(b.qty.slice(1)));
  }, [filteredVisits]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">KPI Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {kpiVisits.length.toLocaleString()} KPI visits ·{' '}
              {totalVisitCount.toLocaleString()} total visits
            </p>
          </div>
          <button
            onClick={() => exportCsv(filteredVisits)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          {/* Date presets + custom range */}
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
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPreset('all'); }}
                className="h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]"
              />
              <span className="text-zinc-600 text-xs">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPreset('all'); }}
                className="h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]"
              />
            </div>
          </div>

          {/* Row 2: filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Rep */}
            <select
              value={repId}
              onChange={e => setRepId(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[150px]"
            >
              <option value="all">All Reps</option>
              {repList.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            {/* KPI type */}
            <select
              value={kpiType}
              onChange={e => setKpiType(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-300 w-[130px]"
            >
              <option value="all">All Types</option>
              {KPI_OPTIONS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>

            {/* Account search */}
            <input
              type="text"
              placeholder="Search account…"
              value={accountSearch}
              onChange={e => setAccountSearch(e.target.value)}
              className="h-8 bg-zinc-800 border border-zinc-700 rounded px-2.5 text-xs text-zinc-300 w-[160px] placeholder-zinc-600"
            />

            {/* Has Photos toggle */}
            <button
              onClick={() => setHasPhotos(h => !h)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                hasPhotos
                  ? 'bg-[#C5A572]/15 text-[#C5A572] border-[#C5A572]/40'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'
              }`}
            >
              <Camera className="h-3 w-3" />
              Has Photos
            </button>

            {/* Qty > 1 toggle */}
            <button
              onClick={() => setQtyGt1(q => !q)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                qtyGt1
                  ? 'bg-[#C5A572]/15 text-[#C5A572] border-[#C5A572]/40'
                  : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'
              }`}
            >
              Qty &gt; 1
            </button>

            <span className="text-xs text-zinc-600 ml-auto">
              {filteredVisits.length.toLocaleString()} results
            </span>
          </div>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total KPI Visits */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">Total KPI Visits</p>
            <p className="text-3xl font-bold tabular-nums">{stats.total.toLocaleString()}</p>
            {priorPct != null ? (
              <p className={`text-xs mt-1.5 font-medium ${priorPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priorPct >= 0 ? '▲' : '▼'} {Math.abs(priorPct).toFixed(1)}% vs prior period
              </p>
            ) : (
              <p className="text-xs mt-1.5 text-zinc-600">All time</p>
            )}
          </div>

          {/* KPI Coverage */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">KPI Coverage</p>
            <p className="text-3xl font-bold tabular-nums">
              {totalVisitCount > 0
                ? ((kpiVisits.length / totalVisitCount) * 100).toFixed(0)
                : '0'}%
            </p>
            <p className="text-xs mt-1.5 text-zinc-600">
              {kpiVisits.length} of {totalVisitCount} visits
            </p>
          </div>

          {/* Avg Quantity */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">Avg Quantity</p>
            <p className="text-3xl font-bold tabular-nums">{stats.avgQty.toFixed(1)}</p>
            <p className="text-xs mt-1.5 text-zinc-600">per KPI visit</p>
          </div>

          {/* Top KPI Type */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-1.5">Top KPI Type</p>
            <p
              className="text-2xl font-bold"
              style={{ color: KPI_COLORS[stats.topType] ?? '#fff' }}
            >
              {stats.total > 0 ? stats.topType : '—'}
            </p>
            <p className="text-xs mt-1.5 text-zinc-600">
              {stats.total > 0 ? `${stats.byType[stats.topType] ?? 0} occurrences` : 'No data'}
            </p>
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        <div>
          <button
            onClick={() => setShowCharts(c => !c)}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-3 transition-colors"
          >
            {showCharts
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Charts</span>
          </button>

          {showCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* KPIs by Type */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">KPIs by Type</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    layout="vertical"
                    data={typeChartData}
                    margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                    <Bar dataKey="count" name="Visits" radius={[0, 3, 3, 0]} maxBarSize={24}>
                      {typeChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* KPIs by Rep */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">KPIs by Rep</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={repChartData}
                    margin={{ top: 0, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                    <Bar dataKey="count" name="Visits" fill="#C5A572" radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Trend */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">Monthly Trend</p>
                {trendData.length < 2 ? (
                  <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">
                    Not enough data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={trendData}
                      margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#71717a', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        dataKey="count"
                        name="KPIs"
                        stroke="#C5A572"
                        strokeWidth={2}
                        dot={{ fill: '#C5A572', r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Quantity Distribution */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-sm font-medium text-zinc-300 mb-3">Quantity Distribution</p>
                {qtyDistData.length === 0 ? (
                  <div className="h-[180px] flex items-center justify-center text-zinc-600 text-sm">
                    No data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart
                      data={qtyDistData}
                      margin={{ top: 0, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                      <XAxis
                        dataKey="qty"
                        tick={{ fill: '#71717a', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#71717a', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
                      <Bar dataKey="count" name="Visits" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── KPI Visits Table ────────────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-300">KPI Visits</p>
            <p className="text-xs text-zinc-600">{filteredVisits.length.toLocaleString()} records</p>
          </div>

          {/* Column header */}
          <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 px-4 py-2 border-b border-zinc-800/60 text-xs text-zinc-600 font-medium uppercase tracking-wide">
            <span />
            <span>Date</span>
            <span>Rep · Account</span>
            <span>KPI · Notes</span>
            <span className="text-right pr-1">Photos</span>
          </div>

          <div className="divide-y divide-zinc-800/50">
            {filteredVisits.length === 0 ? (
              <div className="py-12 text-center text-zinc-600 text-sm">
                No visits match the current filters
              </div>
            ) : (
              filteredVisits.slice(0, 200).map(visit => {
                const isExpanded = expandedId === visit.id;
                const qty        = visit.kpi_quantity;
                const kpiColor   = KPI_COLORS[visit.kpi] ?? '#C5A572';

                return (
                  <div key={visit.id}>
                    {/* ── Row ─────────────────────────────────────────── */}
                    <button
                      className="w-full text-left px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : visit.id)}
                    >
                      {/* Mobile layout */}
                      <div className="md:hidden space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-zinc-600">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                            style={{ backgroundColor: `${kpiColor}20`, color: kpiColor, border: `1px solid ${kpiColor}40` }}
                          >
                            {visit.kpi}
                          </span>
                          {qty != null && qty > 1 && (
                            <span className="text-xs font-bold text-white bg-white/10 px-1.5 py-0.5 rounded">×{qty}</span>
                          )}
                          {visit.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                              <Camera className="h-3 w-3" />{visit.photo_count}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm pl-5">
                          <span className="font-medium text-zinc-200">{visit.rep_name || visit.rep_email}</span>
                          <span className="text-zinc-600">@</span>
                          <span className="text-zinc-400 truncate">{visit.account_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs pl-5">
                          <span className="text-zinc-600">{fmtDate(visit.visited_at)}</span>
                          {visit.notes && (
                            <span className="text-zinc-600 truncate max-w-[200px]">{visit.notes}</span>
                          )}
                        </div>
                      </div>

                      {/* Desktop layout */}
                      <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 items-start">
                        {/* Expand icon */}
                        <span className="text-zinc-600 mt-0.5">
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        {/* Date */}
                        <span className="text-xs text-zinc-500 mt-0.5 whitespace-nowrap">{fmtDate(visit.visited_at)}</span>
                        {/* Rep · Account */}
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-zinc-200 block truncate">
                            {visit.rep_name || visit.rep_email}
                          </span>
                          <span className="text-xs text-zinc-500 truncate block">@ {visit.account_name}</span>
                        </div>
                        {/* KPI · Notes */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold shrink-0"
                              style={{ backgroundColor: `${kpiColor}20`, color: kpiColor, border: `1px solid ${kpiColor}40` }}
                            >
                              {visit.kpi}
                            </span>
                            {qty != null && qty > 1 && (
                              <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded shrink-0">
                                ×{qty}
                              </span>
                            )}
                          </div>
                          {visit.notes && (
                            <p className="text-xs text-zinc-600 truncate">{visit.notes}</p>
                          )}
                        </div>
                        {/* Photos */}
                        <div className="text-right">
                          {visit.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                              <Camera className="h-3 w-3" />
                              {visit.photo_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* ── Expanded detail ──────────────────────────────── */}
                    {isExpanded && (
                      <div className="px-4 md:pl-[148px] pb-4 pt-2 bg-black/20 border-t border-zinc-800/40">
                        <div className="space-y-3">
                          {visit.notes ? (
                            <div>
                              <p className="text-xs text-zinc-600 uppercase tracking-wide mb-1">Notes</p>
                              <p className="text-sm text-zinc-200 leading-relaxed">{visit.notes}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600 italic">No notes recorded</p>
                          )}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                            <span className="text-zinc-600">
                              KPI:{' '}
                              <span style={{ color: kpiColor }} className="font-semibold">{visit.kpi}</span>
                              {qty != null && (
                                <span className="text-white font-bold ml-1">×{qty}</span>
                              )}
                            </span>
                            <span className="text-zinc-600">
                              Photos: <span className="text-zinc-300">{visit.photo_count}</span>
                            </span>
                            <span className="text-zinc-600">
                              Visited: <span className="text-zinc-300">{fmtDatetime(visit.visited_at)}</span>
                            </span>
                          </div>
                          <div>
                            <Link
                              href={`/accounts/${visit.account_id}`}
                              className="inline-flex items-center gap-1 text-xs text-[#C5A572] hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              View account <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {filteredVisits.length > 200 && (
            <div className="px-4 py-3 border-t border-zinc-800 text-center">
              <p className="text-xs text-zinc-600">
                Showing first 200 of {filteredVisits.length.toLocaleString()} results — use filters to narrow down, or export CSV for full data.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
