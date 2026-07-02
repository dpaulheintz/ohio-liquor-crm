'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie,
} from 'recharts';
import { Camera, ChevronDown, ChevronRight, Download, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { KPI_OPTIONS } from '@/lib/types';
import { type KpiEventRow, type KpiDashboardData, type AgencyDisplayRow } from '@/app/actions/kpi';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';
const KPI_COLORS: Record<string, string> = {
  Display: '#C5A572', Menu: '#60a5fa', Feature: '#34d399', Event: '#f472b6',
};
const TYPE_COLORS: Record<string, string> = {
  Wood: '#C5A572', Box: '#60a5fa', Shelves: '#34d399',
};

type DatePreset = '7d' | '30d' | '90d' | 'ytd' | 'all';
const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Last 7d', value: '7d' }, { label: 'Last 30d', value: '30d' },
  { label: 'Last 90d', value: '90d' }, { label: 'YTD', value: 'ytd' },
  { label: 'All Time', value: 'all' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPresetDates(preset: DatePreset): [string, string] {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today = fmt(now);
  const sub   = (days: number) => { const d = new Date(now); d.setDate(d.getDate()-days); return fmt(d); };
  switch (preset) {
    case '7d':  return [sub(6), today];
    case '30d': return [sub(29), today];
    case '90d': return [sub(89), today];
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
function fmtMonthShort(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m-1]} '${String(y).slice(2)}`;
}
function monthLabel(m: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, mo] = m.split('-');
  return `${months[parseInt(mo)-1]}`;
}
function fmtWeekRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  const mo = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${mo(s)} – ${mo(e)}`;
}

/** "Walt Churchill's Market — #20653 — Perrysburg" */
function agencyLabel(name: string, agencyId: string | null, city: string | null): string {
  const parts = [name];
  if (agencyId) parts.push(`#${agencyId}`);
  if (city)     parts.push(city);
  return parts.join(' — ');
}

function exportCsv(events: KpiEventRow[]) {
  const headers = ['Date','Rep','Account','Agency ID','City','KPI Type','Display Type','Quantity','Sold/Unsold','Photos','Notes'];
  const rows = events.map(e => [
    fmtDate(e.visited_at), e.rep_name || e.rep_email,
    e.account_name, e.account_agency_id ?? '', e.account_city ?? '',
    e.kpi, e.display_type ?? '', String(e.kpi_quantity), e.sold_status,
    String(e.photo_count), (e.notes ?? '').replace(/"/g, '""'),
  ]);
  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `kpi-report-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] p-2.5 shadow-xl text-xs min-w-[100px]">
      <p className="text-white/60 mb-1">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? GOLD }}>{p.name}</span>
          <span className="text-white font-mono">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Weekly metric card ───────────────────────────────────────────────────────

function WeeklyCard({ label, value, prior, color, sub }: {
  label: string; value: number; prior: number; color?: string; sub?: string;
}) {
  const delta = value - prior;
  const pct   = prior > 0 ? ((delta / prior) * 100).toFixed(0) : null;
  return (
    <div className="bg-white border border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: color ?? undefined }}>{value}</p>
      <div className="flex items-center gap-1.5 mt-1.5">
        {prior === 0 && value === 0 ? (
          <p className="text-xs text-muted-foreground">{sub ?? 'No prior data'}</p>
        ) : delta > 0 ? (
          <><TrendingUp className="h-3 w-3 text-green-400" /><p className="text-xs text-green-400 font-medium">+{pct}% vs prior wk</p></>
        ) : delta < 0 ? (
          <><TrendingDown className="h-3 w-3 text-red-400" /><p className="text-xs text-red-400 font-medium">{pct}% vs prior wk</p></>
        ) : (
          <><Minus className="h-3 w-3 text-muted-foreground" /><p className="text-xs text-muted-foreground">No change</p></>
        )}
      </div>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Display status cell ──────────────────────────────────────────────────────

function StatusCell({ status }: { status: 'up' | 'down' | null }) {
  if (status === 'up')   return <span className="inline-block h-5 w-5 rounded bg-green-500/20 text-green-400 text-[10px] font-bold flex items-center justify-center">↑</span>;
  if (status === 'down') return <span className="inline-block h-5 w-5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold flex items-center justify-center">↓</span>;
  return <span className="inline-block h-5 w-5 rounded bg-muted text-muted-foreground text-[10px] flex items-center justify-center">—</span>;
}

// ─── Display Tracking Section ─────────────────────────────────────────────────

function DisplayTrackingSection({ displays, onCreateAssignment }: {
  displays: AgencyDisplayRow[];
  onCreateAssignment: (d: AgencyDisplayRow) => void;
}) {
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const curMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }, []);

  // Build month list: first_confirmed month → current month across all displays
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const d of displays) {
      for (const m of Object.keys(d.monthly_status)) set.add(m);
    }
    const arr = Array.from(set).sort();
    // Fill contiguous range
    if (arr.length === 0) return [];
    const result: string[] = [];
    const start = new Date(arr[0] + '-01');
    const end   = new Date(curMonth + '-01');
    const cur   = new Date(start);
    while (cur <= end) {
      result.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
      cur.setMonth(cur.getMonth()+1);
    }
    return result;
  }, [displays, curMonth]);

  const active   = displays.filter(d => d.monthly_status[curMonth] === 'up');
  const inactive = displays.filter(d => d.monthly_status[curMonth] !== 'up' && Object.values(d.monthly_status).some(v => v === 'up'));

  // Consecutive months active (from current month backwards)
  function consecutiveMonths(d: AgencyDisplayRow): number {
    let count = 0;
    const months = allMonths.slice().reverse();
    for (const m of months) {
      if (d.monthly_status[m] === 'up') count++;
      else break;
    }
    return count;
  }
  function lastActiveMonth(d: AgencyDisplayRow): string | null {
    const upMonths = Object.entries(d.monthly_status).filter(([,v]) => v === 'up').map(([m]) => m).sort();
    return upMonths[upMonths.length - 1] ?? null;
  }

  // Charts
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of active) map[d.display_type] = (map[d.display_type] ?? 0) + 1;
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [active]);

  const byRep = useMemo(() => {
    const map: Record<string, { name: string; count: number }> = {};
    for (const d of active) {
      const name = d.rep_name ?? d.rep_email;
      if (!map[d.rep_id]) map[d.rep_id] = { name, count: 0 };
      map[d.rep_id].count++;
    }
    return Object.values(map).sort((a,b) => b.count - a.count);
  }, [active]);

  const trend = useMemo(() => {
    return allMonths.map(m => ({
      month: monthLabel(m),
      active: displays.filter(d => d.monthly_status[m] === 'up').length,
    }));
  }, [displays, allMonths]);

  return (
    <div className="space-y-5">
      {/* Photo modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoModal(null)}>
          <img src={photoModal} alt="Display photo" className="max-h-[80vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ── Summary charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Type */}
        <div className="bg-white border border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Active by Type</p>
          {byType.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active displays</p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={32} outerRadius={52} paddingAngle={2}>
                  {byType.map((e) => <Cell key={e.name} fill={TYPE_COLORS[e.name] ?? '#888'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1C1C1C', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11, color: '#fff' }} itemStyle={{ color: '#e4e4e7' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="space-y-1 mt-1">
            {byType.map(e => (
              <div key={e.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[e.name] ?? '#888' }} />
                <span className="flex-1 text-muted-foreground">{e.name}</span>
                <span className="text-foreground font-mono">{e.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Rep */}
        <div className="bg-white border border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Active by Rep</p>
          {byRep.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active displays</p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={byRep} margin={{ top: 0, right: 12, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,16,46,0.06)' }} />
                <Bar dataKey="count" name="Displays" fill={GOLD} radius={[3,3,0,0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly trend */}
        <div className="bg-white border border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider">Active Trend</p>
          {trend.length < 2 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Not enough data</p>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line dataKey="active" name="Active" stroke={GOLD} strokeWidth={2} dot={{ fill: GOLD, r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Active displays ── */}
      <div className="bg-white border border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-400" />
          <p className="text-sm font-medium text-foreground">Active Displays</p>
          <span className="text-xs text-muted-foreground">{active.length} confirmed this month</span>
        </div>
        {active.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">No active displays this month</p>
        ) : (
          <div className="divide-y divide-border">
            <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_80px_60px] gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
              <span>Agency</span><span>Rep</span><span>Type</span><span>Months</span><span>First Set</span><span className="text-right">Photo</span>
            </div>
            {active.map(d => (
              <div key={d.id} className="px-4 py-3 grid md:grid-cols-[1fr_100px_80px_80px_80px_60px] gap-3 items-center">
                <div>
                  <p className="text-sm text-foreground font-medium">{d.agency_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[d.account_agency_id ? `#${d.account_agency_id}` : null, d.account_city].filter(Boolean).join(' — ')}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{d.rep_name ?? d.rep_email}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                  style={{ background: `${TYPE_COLORS[d.display_type] ?? '#888'}20`, color: TYPE_COLORS[d.display_type] ?? '#888', border: `1px solid ${TYPE_COLORS[d.display_type] ?? '#888'}40` }}>
                  {d.display_type}
                </span>
                <span className="text-xs text-muted-foreground">{consecutiveMonths(d)} mo.</span>
                <span className="text-xs text-muted-foreground">{d.first_confirmed ? fmtMonthShort(d.first_confirmed.slice(0,7)) : '—'}</span>
                <div className="text-right">
                  {d.latest_photo_url ? (
                    <button onClick={() => setPhotoModal(d.latest_photo_url!)}>
                      <img src={d.latest_photo_url} alt="Display" className="h-8 w-8 rounded object-cover ml-auto hover:opacity-80 transition-opacity border border" />
                    </button>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Inactive / lost displays ── */}
      {inactive.length > 0 && (
        <div className="bg-white border border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <p className="text-sm font-medium text-foreground">Lost / Inactive Displays</p>
            <span className="text-xs text-muted-foreground">{inactive.length} need follow-up</span>
          </div>
          <div className="divide-y divide-border">
            <div className="hidden md:grid grid-cols-[1fr_100px_80px_100px_80px_auto] gap-3 px-4 py-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
              <span>Agency</span><span>Rep</span><span>Type</span><span>Last Active</span><span>Mo. Since</span><span />
            </div>
            {inactive.map(d => {
              const lastActive = lastActiveMonth(d);
              const monthsSince = lastActive ? allMonths.length - allMonths.indexOf(lastActive) - 1 : null;
              return (
                <div key={d.id} className="px-4 py-3 grid md:grid-cols-[1fr_100px_80px_100px_80px_auto] gap-3 items-center">
                  <div>
                    <p className="text-sm text-foreground font-medium">{d.agency_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[d.account_agency_id ? `#${d.account_agency_id}` : null, d.account_city].filter(Boolean).join(' — ')}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{d.rep_name ?? d.rep_email}</span>
                  <span className="text-xs text-muted-foreground">{d.display_type}</span>
                  <span className="text-xs text-amber-500">{lastActive ? fmtMonthShort(lastActive) : '—'}</span>
                  <span className="text-xs text-red-400">{monthsSince != null ? `${monthsSince} mo.` : '—'}</span>
                  <button
                    onClick={() => onCreateAssignment(d)}
                    className="text-xs px-2.5 py-1 rounded border border text-muted-foreground hover:border-primary/60 hover:text-primary transition-colors shrink-0"
                  >
                    Assign Check
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Timeline grid ── */}
      <div className="bg-white border border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border">
          <p className="text-sm font-medium text-foreground">Display Timeline</p>
          <p className="text-xs text-muted-foreground mt-0.5">↑ Up · ↓ Down · — No data</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border">
                <th className="text-left px-4 py-2 text-muted-foreground font-medium w-[220px] sticky left-0 bg-white">Agency</th>
                <th className="px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">Rep</th>
                <th className="px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">Type</th>
                {allMonths.map(m => (
                  <th key={m} className={`px-2 py-2 text-muted-foreground font-medium whitespace-nowrap ${m === curMonth ? 'text-primary' : ''}`}>
                    {monthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displays.sort((a,b) => a.agency_name.localeCompare(b.agency_name)).map(d => (
                <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 sticky left-0 bg-white">
                    <p className="text-foreground font-medium truncate max-w-[200px]">{d.agency_name}</p>
                    <p className="text-muted-foreground">{d.account_city}</p>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">{(d.rep_name ?? d.rep_email).split(' ')[0]}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="text-[10px] font-semibold" style={{ color: TYPE_COLORS[d.display_type] ?? '#888' }}>{d.display_type}</span>
                  </td>
                  {allMonths.map(m => (
                    <td key={m} className="px-2 py-2 text-center">
                      <StatusCell status={(d.monthly_status[m] as 'up' | 'down') ?? null} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Visit group ──────────────────────────────────────────────────────────────

interface VisitGroup {
  visit_id:    string;
  visited_at:  string;
  rep_id:      string;
  rep_name:    string | null;
  rep_email:   string;
  account_id:  string;
  account_name:     string;
  account_city:     string | null;
  account_agency_id: string | null;
  notes:       string | null;
  photo_count: number;
  photo_urls:  string[];
  visit_type:  'in_person' | 'phone_call';
  kpis:        KpiEventRow[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export function KpiDashboardClient({ kpiEvents, totalVisitCount, weeklyMetrics, agencyDisplays }: KpiDashboardData) {

  // ── Filter state ────────────────────────────────────────────────────────────
  const [preset, setPreset]               = useState<DatePreset>('all');
  const [dateFrom, setDateFrom]           = useState('');
  const [dateTo, setDateTo]               = useState('');
  const [repId, setRepId]                 = useState('all');
  const [kpiType, setKpiType]             = useState('all');
  const [accountSearch, setAccountSearch] = useState('');
  const [hasPhotos, setHasPhotos]         = useState(false);
  const [qtyGt1, setQtyGt1]               = useState(false);
  const [soldStatusFilter, setSoldStatusFilter] = useState<'all' | 'sold' | 'unsold'>('all');
  const [expandedId, setExpandedId]       = useState<string | null>(null);
  const [showCharts, setShowCharts]       = useState(true);
  const [showDisplays, setShowDisplays]   = useState(true);

  // ── Rep list ────────────────────────────────────────────────────────────────
  const repList = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const e of kpiEvents) {
      if (!seen.has(e.rep_id)) seen.set(e.rep_id, { id: e.rep_id, name: e.rep_name || e.rep_email });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [kpiEvents]);

  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p);
    const [from, to] = getPresetDates(p);
    setDateFrom(from); setDateTo(to);
  }, []);

  // ── Filtered events ─────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let r = kpiEvents;
    if (dateFrom) r = r.filter(e => e.visited_at.slice(0,10) >= dateFrom);
    if (dateTo)   r = r.filter(e => e.visited_at.slice(0,10) <= dateTo);
    if (repId !== 'all')   r = r.filter(e => e.rep_id === repId);
    if (kpiType !== 'all') r = r.filter(e => e.kpi === kpiType);
    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      r = r.filter(e => e.account_name.toLowerCase().includes(q) || (e.account_agency_id ?? '').includes(q));
    }
    if (soldStatusFilter !== 'all') r = r.filter(e => e.sold_status === soldStatusFilter);
    return r;
  }, [kpiEvents, dateFrom, dateTo, repId, kpiType, accountSearch, soldStatusFilter]);

  // ── Group by visit ──────────────────────────────────────────────────────────
  const visitGroups = useMemo(() => {
    const map = new Map<string, VisitGroup>();
    for (const e of filteredEvents) {
      if (!map.has(e.visit_id)) {
        map.set(e.visit_id, {
          visit_id: e.visit_id, visited_at: e.visited_at,
          rep_id: e.rep_id, rep_name: e.rep_name, rep_email: e.rep_email,
          account_id: e.account_id, account_name: e.account_name,
          account_city: e.account_city, account_agency_id: e.account_agency_id,
          notes: e.notes, photo_count: e.photo_count, photo_urls: e.photo_urls ?? [],
          visit_type: e.visit_type, kpis: [],
        });
      }
      map.get(e.visit_id)!.kpis.push(e);
    }
    return Array.from(map.values()).sort((a, b) => b.visited_at.localeCompare(a.visited_at));
  }, [filteredEvents]);

  const visibleGroups = useMemo(() => {
    let g = visitGroups;
    if (hasPhotos) g = g.filter(v => v.photo_count > 0);
    if (qtyGt1)   g = g.filter(v => v.kpis.some(k => k.kpi_quantity > 1));
    return g;
  }, [visitGroups, hasPhotos, qtyGt1]);

  const visibleEvents = useMemo(() => visibleGroups.flatMap(g => g.kpis), [visibleGroups]);

  // ── Stats ───────────────────────────────────────────────────────────────────
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

  const priorPct = useMemo<number | null>(() => {
    if (!dateFrom || !dateTo) return null;
    const from  = new Date(dateFrom), to = new Date(dateTo);
    const days  = Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1;
    const pFrom = new Date(from); pFrom.setDate(pFrom.getDate() - days);
    const pTo   = new Date(from); pTo.setDate(pTo.getDate() - 1);
    const pad   = (n: number) => String(n).padStart(2, '0');
    const fmt   = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const prior = kpiEvents.filter(e => {
      const d = e.visited_at.slice(0, 10);
      return d >= fmt(pFrom) && d <= fmt(pTo);
    }).length;
    if (prior === 0) return null;
    return ((stats.totalEvents - prior) / prior) * 100;
  }, [kpiEvents, dateFrom, dateTo, stats.totalEvents]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const typeChartData = useMemo(() =>
    KPI_OPTIONS.map(k => ({ name: k, count: stats.byType[k] ?? 0, fill: KPI_COLORS[k] })),
    [stats.byType]);

  const repChartData = useMemo(() =>
    Object.values(stats.byRep).sort((a, b) => b.count - a.count).slice(0, 10)
      .map(r => ({ name: r.name.split(' ')[0], fullName: r.name, count: r.count })),
    [stats.byRep]);

  const trendData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const e of visibleEvents) { const m = e.visited_at.slice(0, 7); byMonth[m] = (byMonth[m] ?? 0) + 1; }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
      .map(([m, count]) => ({ month: fmtMonthShort(m), count }));
  }, [visibleEvents]);

  const qtyDistData = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const e of visibleEvents) counts[e.kpi_quantity] = (counts[e.kpi_quantity] ?? 0) + 1;
    return Object.entries(counts).map(([qty, count]) => ({ qty: `×${qty}`, count }))
      .sort((a, b) => parseInt(a.qty.slice(1)) - parseInt(b.qty.slice(1)));
  }, [visibleEvents]);

  const soldCount   = useMemo(() => visibleEvents.filter(e => e.sold_status === 'sold'   && (e.kpi === 'Menu' || e.kpi === 'Feature')).length, [visibleEvents]);
  const unsoldCount = useMemo(() => visibleEvents.filter(e => e.sold_status === 'unsold' && (e.kpi === 'Menu' || e.kpi === 'Feature')).length, [visibleEvents]);
  const totalKpiVisits = useMemo(() => new Set(kpiEvents.map(e => e.visit_id)).size, [kpiEvents]);

  // ── Assignment stub ─────────────────────────────────────────────────────────
  function handleCreateAssignment(d: AgencyDisplayRow) {
    alert(`Assignment flow coming soon!\n\nWould assign: Check display at ${d.agency_name} (${d.account_city}) to ${d.rep_name ?? d.rep_email}`);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">KPI Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {kpiEvents.length.toLocaleString()} KPI events · {totalKpiVisits.toLocaleString()} KPI visits · {totalVisitCount.toLocaleString()} total visits
            </p>
          </div>
          <button
            onClick={() => exportCsv(visibleEvents)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border bg-white text-xs text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>

        {/* ── Weekly metric cards ────────────────────────────────────── */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
            Last Week · {fmtWeekRange(weeklyMetrics.weekStart, weeklyMetrics.weekEnd)}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <WeeklyCard label="Whiskey Events" value={weeklyMetrics.whiskyEvents} prior={weeklyMetrics.whiskyEventsPrior} color="#f472b6" />
            <WeeklyCard label="Whiskey Features" value={weeklyMetrics.whiskyFeatures} prior={weeklyMetrics.whiskyFeaturesPrior} color="#34d399" />
            <WeeklyCard label="Active Displays" value={weeklyMetrics.activeDisplays} prior={weeklyMetrics.activeDisplaysPrior} color={GOLD}
              sub="this month vs last" />
            <WeeklyCard label="Tastings" value={weeklyMetrics.tastings} prior={weeklyMetrics.tastingsPrior} color="#60a5fa" />
          </div>
        </div>

        {/* ── Filters ───────────────────────────────────────────────── */}
        <div className="bg-white/60 border border rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => applyPreset(p.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  preset === p.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}>{p.label}</button>
            ))}
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('all'); }}
                className="h-7 bg-muted border border rounded px-2 text-xs text-foreground w-[130px]" />
              <span className="text-muted-foreground text-xs">→</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('all'); }}
                className="h-7 bg-muted border border rounded px-2 text-xs text-foreground w-[130px]" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={repId} onChange={e => setRepId(e.target.value)}
              className="h-8 bg-muted border border rounded px-2 text-xs text-foreground w-[150px]">
              <option value="all">All Reps</option>
              {repList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={kpiType} onChange={e => setKpiType(e.target.value)}
              className="h-8 bg-muted border border rounded px-2 text-xs text-foreground w-[130px]">
              <option value="all">All Types</option>
              {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <input type="text" placeholder="Search account or ID…" value={accountSearch} onChange={e => setAccountSearch(e.target.value)}
              className="h-8 bg-muted border border rounded px-2.5 text-xs text-foreground w-[180px] placeholder-zinc-600" />
            <button onClick={() => setHasPhotos(h => !h)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                hasPhotos ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border hover:text-foreground'
              }`}><Camera className="h-3 w-3" /> Has Photos</button>
            <button onClick={() => setQtyGt1(q => !q)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium transition-colors border ${
                qtyGt1 ? 'bg-primary/10 text-primary border-primary/40' : 'bg-muted text-muted-foreground border hover:text-foreground'
              }`}>Qty &gt; 1</button>
            <div className="flex rounded border border overflow-hidden text-xs">
              {(['all', 'sold', 'unsold'] as const).map(s => (
                <button key={s} onClick={() => setSoldStatusFilter(s)}
                  className={`px-2.5 py-1 capitalize transition-colors ${soldStatusFilter === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">
              {visibleGroups.length.toLocaleString()} visits · {visibleEvents.length.toLocaleString()} KPI events
            </span>
          </div>
        </div>

        {/* ── Filter-period stat cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1.5">KPI Events</p>
            <p className="text-3xl font-bold tabular-nums">{stats.totalEvents.toLocaleString()}</p>
            {priorPct != null ? (
              <p className={`text-xs mt-1.5 font-medium ${priorPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priorPct >= 0 ? '▲' : '▼'} {Math.abs(priorPct).toFixed(1)}% vs prior
              </p>
            ) : <p className="text-xs mt-1.5 text-muted-foreground">{stats.totalVisits} visits</p>}
          </div>
          <div className="bg-white border border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1.5">KPI Coverage</p>
            <p className="text-3xl font-bold tabular-nums">
              {totalVisitCount > 0 ? ((totalKpiVisits / totalVisitCount) * 100).toFixed(0) : '0'}%
            </p>
            <p className="text-xs mt-1.5 text-muted-foreground">{totalKpiVisits} of {totalVisitCount} visits</p>
          </div>
          <div className="bg-white border border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1.5">Avg Quantity</p>
            <p className="text-3xl font-bold tabular-nums">{stats.avgQty.toFixed(1)}</p>
            <p className="text-xs mt-1.5 text-muted-foreground">per KPI event</p>
          </div>
          <div className="bg-white border border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1.5">Top KPI Type</p>
            <p className="text-2xl font-bold" style={{ color: KPI_COLORS[stats.topType] ?? '#fff' }}>
              {stats.totalEvents > 0 ? stats.topType : '—'}
            </p>
            <p className="text-xs mt-1.5 text-muted-foreground">
              {stats.totalEvents > 0 ? `${stats.byType[stats.topType] ?? 0} events` : 'No data'}
            </p>
          </div>
        </div>

        {/* Sold/Unsold summary */}
        {(stats.byType['Menu'] > 0 || stats.byType['Feature'] > 0) && (
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">Menu + Feature KPIs:</span>
            <span className="text-emerald-400 font-medium">✓ {soldCount} sold</span>
            <span className="text-amber-400 font-medium">○ {unsoldCount} unsold</span>
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────── */}
        <div>
          <button onClick={() => setShowCharts(c => !c)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
            {showCharts ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Charts</span>
          </button>
          {showCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-3">KPI Events by Type</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart layout="vertical" data={typeChartData} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,16,46,0.06)' }} />
                    <Bar dataKey="count" name="Events" radius={[0, 3, 3, 0]} maxBarSize={24}>
                      {typeChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-3">KPI Events by Rep</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={repChartData} margin={{ top: 0, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,16,46,0.06)' }} />
                    <Bar dataKey="count" name="Events" fill={GOLD} radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white border border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-3">Monthly Trend</p>
                {trendData.length < 2 ? (
                  <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">Not enough data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#666666', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line dataKey="count" name="Events" stroke={GOLD} strokeWidth={2}
                        dot={{ fill: GOLD, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-white border border rounded-xl p-4">
                <p className="text-sm font-medium text-foreground mb-3">Quantity Distribution</p>
                {qtyDistData.length === 0 ? (
                  <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={qtyDistData} margin={{ top: 0, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="qty" tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#666666', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(200,16,46,0.06)' }} />
                      <Bar dataKey="count" name="Events" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Display Tracking ──────────────────────────────────────── */}
        <div>
          <button onClick={() => setShowDisplays(c => !c)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
            {showDisplays ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">Display Tracking</span>
            <span className="text-xs text-muted-foreground ml-1">
              {agencyDisplays.length} accounts · {weeklyMetrics.activeDisplays} active this month
            </span>
          </button>
          {showDisplays && (
            <DisplayTrackingSection displays={agencyDisplays} onCreateAssignment={handleCreateAssignment} />
          )}
        </div>

        {/* ── KPI Visits Table ───────────────────────────────────────── */}
        <div className="bg-white border border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">KPI Visit Log</p>
            <p className="text-xs text-muted-foreground">{visibleGroups.length.toLocaleString()} visits</p>
          </div>

          {/* Desktop column header */}
          <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 px-4 py-2 border-b border text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <span /><span>Date</span><span>Rep · Account</span><span>KPIs</span><span className="text-right pr-1">Photos</span>
          </div>

          <div className="divide-y divide-border">
            {visibleGroups.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No visits match the current filters</div>
            ) : (
              visibleGroups.slice(0, 200).map(group => {
                const isExpanded = expandedId === group.visit_id;
                return (
                  <div key={group.visit_id}>
                    <button className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : group.visit_id)}>

                      {/* Mobile */}
                      <div className="md:hidden space-y-1">
                        <div className="flex items-center gap-2 flex-wrap pl-5">
                          <span className="text-muted-foreground -ml-5">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          {group.kpis.map(k => {
                            const color = KPI_COLORS[k.kpi] ?? '#888';
                            return (
                              <span key={k.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                {k.kpi}{k.display_type ? ` (${k.display_type})` : ''}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
                              </span>
                            );
                          })}
                          {group.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Camera className="h-3 w-3" />{group.photo_count}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm pl-5">
                          <span className="font-medium text-foreground">{group.rep_name || group.rep_email}</span>
                          <span className="text-muted-foreground">@</span>
                          <span className="text-muted-foreground truncate">{group.account_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5">{fmtDate(group.visited_at)}</p>
                      </div>

                      {/* Desktop */}
                      <div className="hidden md:grid grid-cols-[24px_100px_1fr_1fr_auto] gap-3 items-start">
                        <span className="text-muted-foreground mt-0.5">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{fmtDate(group.visited_at)}</span>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block truncate">{group.rep_name || group.rep_email}</span>
                          <span className="text-xs text-muted-foreground truncate block">
                            @ {agencyLabel(group.account_name, group.account_agency_id, group.account_city)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {group.kpis.map(k => {
                            const color = KPI_COLORS[k.kpi] ?? '#888';
                            return (
                              <span key={k.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                                style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                {k.kpi}{k.display_type ? ` · ${k.display_type}` : ''}{k.kpi_quantity > 1 ? ` ×${k.kpi_quantity}` : ''}
                              </span>
                            );
                          })}
                        </div>
                        <div className="text-right">
                          {group.photo_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Camera className="h-3 w-3" />{group.photo_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 md:pl-[148px] pb-4 pt-2 bg-muted/30 border-t border">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Account:</span>
                            <span className="text-xs font-medium text-foreground">
                              {agencyLabel(group.account_name, group.account_agency_id, group.account_city)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Visit Type:</span>
                            <span className="text-xs font-medium text-foreground">
                              {group.visit_type === 'phone_call' ? '📞 Phone Call' : '📍 In Person'}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">KPIs</p>
                            <div className="flex flex-wrap gap-2">
                              {group.kpis.map(k => {
                                const color = KPI_COLORS[k.kpi] ?? '#888';
                                return (
                                  <div key={k.id} className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                                      style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}>
                                      {k.kpi}{k.display_type ? ` · ${k.display_type}` : ''}
                                    </span>
                                    {k.kpi_quantity > 1 && (
                                      <span className="text-xs font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">×{k.kpi_quantity}</span>
                                    )}
                                    {(k.kpi === 'Menu' || k.kpi === 'Feature') && (
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${k.sold_status === 'sold' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {k.sold_status}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {group.notes && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                              <p className="text-sm text-foreground leading-relaxed">{group.notes}</p>
                            </div>
                          )}
                          {group.photo_count > 0 && group.photo_urls.length > 0 && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Photos</p>
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {group.photo_urls.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Photo ${i+1}`} className="h-28 w-28 rounded-lg object-cover shrink-0 hover:opacity-90 transition-opacity border border" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                            <span>Photos: <span className="text-foreground">{group.photo_count}</span></span>
                            <span>Visited: <span className="text-foreground">{fmtDatetime(group.visited_at)}</span></span>
                          </div>
                          <Link href={`/accounts/${group.account_id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
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
            <div className="px-4 py-3 border-t border text-center">
              <p className="text-xs text-muted-foreground">
                Showing first 200 of {visibleGroups.length.toLocaleString()} visits. Use filters or export CSV for full data.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
