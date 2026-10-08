'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Camera, Check, ChevronDown, ChevronRight, Download, Gift, Loader2, Star, Video } from 'lucide-react';
import { toast } from 'sonner';
import { getVisitMediaUrls, markGiftCardSent } from '@/app/actions/secret-shopper';
import {
  SECTIONS,
  SHOPPER_LOCATIONS,
  fmtTicketTime,
  sectionLabel,
  type SectionKey,
  type SecretShopperVisitRow,
  type ShopperLocation,
} from '@/lib/secret-shopper';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';
const CRITICAL = '#d03b3b';
// Categorical slots 1–4, validated for CVD separation on white.
const LOCATION_COLORS: Record<ShopperLocation, string> = {
  Grandview: '#2a78d6',
  Westerville: '#eb6834',
  Gahanna: '#1baf7a',
  'PO Box 21': '#eda100',
};
const AXIS_TICK = { fill: '#898781', fontSize: 10 };
const GRID = '#ececec';

type LocationFilter = 'all' | ShopperLocation;
type ServiceFilter = 'all' | 'Bar' | 'Table';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rating(v: SecretShopperVisitRow, key: SectionKey): number | null {
  return v[`${key}_rating` as `${SectionKey}_rating`];
}
function notes(v: SecretShopperVisitRow, key: SectionKey): string | null {
  return v[`${key}_notes` as `${SectionKey}_notes`];
}

function avg(xs: (number | null | undefined)[]): number | null {
  const vals = xs.filter((x): x is number => x != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000);
}

function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  return toDateStr(new Date(y, m - 1, d - offset));
}

function fmtDay(dateStr: string, withYear = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtMinSec(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function scoreCellClass(v: number | null): string {
  if (v == null) return 'text-muted-foreground';
  if (v >= 4.5) return 'bg-green-50 text-green-800 font-semibold';
  if (v < 3.5) return 'bg-red-50 text-red-700 font-semibold';
  return 'text-foreground';
}

function csvCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  // Shopper text is untrusted: neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ num, title, right }: { num: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground shrink-0">{num}</span>
      <h2 className="font-serif text-base font-semibold text-foreground tracking-wide shrink-0">{title}</h2>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, rgba(200,16,46,0.2), transparent)' }} />
      {right}
    </div>
  );
}

function KpiCard({ label, value, sub, onClick, active }: { label: string; value: string; sub?: string; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card px-5 py-4 flex flex-col gap-1.5 text-left',
        onClick && 'hover:border-primary/40 transition-colors cursor-pointer',
        active && 'border-primary ring-1 ring-primary/30',
      )}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold leading-none text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Comp>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: any[]; label?: string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[150px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-white/80 truncate">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color ?? p.payload?.fill ?? p.fill }} />
            {p.name}
          </span>
          <span className="font-mono font-semibold text-white">{format ? format(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Stars({ value, size = 'h-3.5 w-3.5' }: { value: number | null; size?: string }) {
  const filled = value == null ? 0 : Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value == null ? 'Not rated' : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={size} strokeWidth={1.5} style={n <= filled ? { fill: GOLD, color: '#A8875A' } : { color: '#D1D5DB' }} />
      ))}
    </span>
  );
}

function Empty({ text = 'No visits in this range.' }: { text?: string }) {
  return <p className="py-10 text-center text-muted-foreground text-sm">{text}</p>;
}

function Card({ title, children, className, right }: { title: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-white border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-3 py-1 text-xs transition-colors whitespace-nowrap',
            value === o.value ? 'bg-primary text-white font-semibold' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface SecretShopperDashboardClientProps {
  visits: SecretShopperVisitRow[];
  demo: boolean;
  loadError: string | null;
}

export function SecretShopperDashboardClient({ visits: initialVisits, demo, loadError }: SecretShopperDashboardClientProps) {
  const [visits, setVisits] = useState(initialVisits);
  const today = toDateStr(new Date());
  const [dateFrom, setDateFrom] = useState(addDays(today, -89));
  const [dateTo, setDateTo] = useState(today);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [compareLocations, setCompareLocations] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, Record<string, string> | 'loading' | 'error'>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const inRange = (v: SecretShopperVisitRow, from: string, to: string) => v.visit_date >= from && v.visit_date <= to;
  const matchesService = (v: SecretShopperVisitRow) => serviceFilter === 'all' || v.service_type === serviceFilter;
  const matchesLocation = (v: SecretShopperVisitRow) => locationFilter === 'all' || v.location === locationFilter;

  // `scoped` keeps every location (for cross-location comparisons); `filtered` also applies the location filter.
  const scoped = useMemo(
    () => visits.filter((v) => inRange(v, dateFrom, dateTo) && matchesService(v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visits, dateFrom, dateTo, serviceFilter],
  );
  const filtered = useMemo(() => scoped.filter(matchesLocation), [scoped, locationFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const span = Math.max(1, daysBetween(dateFrom, dateTo) + 1);
  const priorFrom = addDays(dateFrom, -span);
  const priorTo = addDays(dateFrom, -1);
  const prior = useMemo(
    () => visits.filter((v) => inRange(v, priorFrom, priorTo) && matchesService(v) && matchesLocation(v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visits, priorFrom, priorTo, serviceFilter, locationFilter],
  );

  const emailCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visits) m.set(v.shopper_email, (m.get(v.shopper_email) ?? 0) + 1);
    return m;
  }, [visits]);

  // ── 01 Overview ───────────────────────────────────────────────────────────
  const overview = useMemo(() => {
    const score = avg(filtered.map((v) => v.overall_score));
    const priorScore = avg(prior.map((v) => v.overall_score));
    const ticket = avg(filtered.map((v) => v.ticket_time_seconds));
    const priorTicket = avg(prior.map((v) => v.ticket_time_seconds));
    const pending = visits.filter((v) => v.gift_card_status === 'pending').length;

    let scoreSub = 'No prior-period data';
    if (score != null && priorScore != null) {
      const d = score - priorScore;
      scoreSub = `${d >= 0 ? '▲ +' : '▼ −'}${Math.abs(d).toFixed(2)} vs prior period`;
    }
    let ticketSub = 'No prior-period data';
    if (ticket != null && priorTicket != null) {
      const d = ticket - priorTicket;
      ticketSub = `${d <= 0 ? '▼ faster by ' : '▲ slower by '}${fmtMinSec(Math.abs(d))} vs prior period`;
    }
    const visitDelta = filtered.length - prior.length;
    return {
      visits: filtered.length,
      visitsSub: `${visitDelta >= 0 ? '+' : '−'}${Math.abs(visitDelta)} vs prior period`,
      score,
      scoreSub,
      ticket,
      ticketSub,
      pending,
    };
  }, [filtered, prior, visits]);

  // ── 02 Section scorecard ──────────────────────────────────────────────────
  const canCompare = locationFilter === 'all';
  const showCompare = compareLocations && canCompare;

  const sectionData = useMemo(() => SECTIONS.map((s) => {
    const row: Record<string, string | number | null> = {
      name: s.short,
      avg: round2(avg(filtered.map((v) => rating(v, s.key)))),
    };
    for (const loc of SHOPPER_LOCATIONS) row[loc] = round2(avg(scoped.filter((v) => v.location === loc).map((v) => rating(v, s.key))));
    return row;
  }), [filtered, scoped]);

  const lowestSection = useMemo(() => {
    let low: { name: string; avg: number } | null = null;
    for (const r of sectionData) {
      if (typeof r.avg === 'number' && (low == null || r.avg < low.avg)) low = { name: r.name as string, avg: r.avg };
    }
    return low;
  }, [sectionData]);

  const compareLocationsPresent = SHOPPER_LOCATIONS.filter((loc) => scoped.some((v) => v.location === loc));

  // ── 03 Location comparison ────────────────────────────────────────────────
  const locationRows = useMemo(() => SHOPPER_LOCATIONS.map((loc) => {
    const vs = scoped.filter((v) => v.location === loc);
    return {
      loc,
      visits: vs.length,
      overall: avg(vs.map((v) => v.overall_score)),
      sections: Object.fromEntries(SECTIONS.map((s) => [s.key, avg(vs.map((v) => rating(v, s.key)))])) as Record<SectionKey, number | null>,
      ticket: avg(vs.map((v) => v.ticket_time_seconds)),
    };
  }), [scoped]);

  // ── 04 Ticket time ────────────────────────────────────────────────────────
  const timedVisits = useMemo(() => filtered.filter((v) => v.ticket_time_seconds != null), [filtered]);
  const lineLocations = locationFilter === 'all' ? SHOPPER_LOCATIONS.filter((l) => filtered.some((v) => v.location === l)) : [locationFilter];

  const ticketWeekly = useMemo(() => {
    const weeks = [...new Set(timedVisits.map((v) => weekStart(v.visit_date)))].sort();
    return weeks.map((w) => {
      const row: Record<string, string | number | null> = { week: fmtDay(w) };
      for (const loc of SHOPPER_LOCATIONS) {
        const secs = avg(timedVisits.filter((v) => v.location === loc && weekStart(v.visit_date) === w).map((v) => v.ticket_time_seconds));
        row[loc] = secs == null ? null : Math.round((secs / 60) * 10) / 10;
      }
      return row;
    });
  }, [timedVisits]);

  const ticketBuckets = useMemo(() => {
    const buckets = [
      { name: 'Under 15 min', test: (s: number) => s < 900 },
      { name: '15–25 min', test: (s: number) => s >= 900 && s <= 1500 },
      { name: 'Over 25 min', test: (s: number) => s > 1500 },
    ];
    return buckets.map((b) => {
      const vs = timedVisits.filter((v) => b.test(v.ticket_time_seconds!));
      return {
        name: b.name,
        timed: vs.filter((v) => v.ticket_time_source === 'timer').length,
        manual: vs.filter((v) => v.ticket_time_source === 'manual').length,
      };
    });
  }, [timedVisits]);
  const timedCount = timedVisits.filter((v) => v.ticket_time_source === 'timer').length;
  const manualCount = timedVisits.filter((v) => v.ticket_time_source === 'manual').length;

  // ── 05 Trend ──────────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months = [...new Set(filtered.map((v) => v.visit_date.slice(0, 7)))].sort();
    return months.map((m) => {
      const row: Record<string, string | number | null> = { month: fmtMonth(m) };
      for (const loc of SHOPPER_LOCATIONS) {
        row[loc] = round2(avg(filtered.filter((v) => v.location === loc && v.visit_date.startsWith(m)).map((v) => v.overall_score)));
      }
      return row;
    });
  }, [filtered]);

  // ── 06 Feed ───────────────────────────────────────────────────────────────
  const feed = pendingOnly ? visits.filter((v) => v.gift_card_status === 'pending') : filtered;

  async function toggleExpand(v: SecretShopperVisitRow) {
    const next = expandedId === v.id ? null : v.id;
    setExpandedId(next);
    if (next && v.media.length > 0 && !mediaUrls[v.id]) {
      setMediaUrls((m) => ({ ...m, [v.id]: 'loading' }));
      try {
        const urls = await getVisitMediaUrls(v.id);
        setMediaUrls((m) => ({ ...m, [v.id]: urls }));
      } catch {
        setMediaUrls((m) => ({ ...m, [v.id]: 'error' }));
      }
    }
  }

  // ── 07 Gift cards ─────────────────────────────────────────────────────────
  const pendingCards = useMemo(
    () => visits.filter((v) => v.gift_card_status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [visits],
  );
  const sentCards = useMemo(
    () => visits.filter((v) => v.gift_card_status === 'sent').sort((a, b) => (b.gift_card_sent_at ?? '').localeCompare(a.gift_card_sent_at ?? '')),
    [visits],
  );

  async function handleMarkSent(v: SecretShopperVisitRow) {
    setSendingId(v.id);
    try {
      const res = await markGiftCardSent(v.id);
      setVisits((prev) => prev.map((x) => (x.id === v.id ? { ...x, gift_card_status: 'sent', ...res } : x)));
      toast.success(`Gift card marked sent to ${v.shopper_email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update gift card');
    } finally {
      setSendingId(null);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = [
      'Visit Date', 'Location', 'Service', 'Overall Score',
      ...SECTIONS.flatMap((s) => [`${s.short} Rating`, `${s.short} Notes`]),
      'Ticket Time (sec)', 'Ticket Time', 'Ticket Time Source', 'Order Placed At', 'Food Delivered At',
      'Photos', 'Videos', 'Shopper Email', 'Repeat Email', 'Gift Card Status', 'Gift Card Sent At', 'Gift Card Sent By', 'Submitted At',
    ];
    const rows = filtered.map((v) => [
      v.visit_date, v.location, v.service_type, v.overall_score,
      ...SECTIONS.flatMap((s) => [rating(v, s.key), notes(v, s.key)]),
      v.ticket_time_seconds, v.ticket_time_seconds == null ? '' : fmtTicketTime(v.ticket_time_seconds), v.ticket_time_source,
      v.order_placed_at, v.food_delivered_at,
      v.media.filter((m) => m.media_type === 'photo').length, v.media.filter((m) => m.media_type === 'video').length,
      v.shopper_email, (emailCounts.get(v.shopper_email) ?? 0) > 1 ? 'Yes' : 'No',
      v.gift_card_status, v.gift_card_sent_at, v.gift_card_sent_by_name, v.created_at,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `secret-shopper-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const scoreFmt = (n: number) => n.toFixed(2);
  const minFmt = (n: number) => `${n} min`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b px-6 py-5">
        <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">Secret Shopper</h1>
        <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">Restaurant Visit Reviews</p>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-sm px-6 py-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="text-muted-foreground uppercase tracking-wider">Range</span>
          <input type="date" value={dateFrom} max={dateTo} onChange={(e) => e.target.value && setDateFrom(e.target.value)}
            className="bg-white border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60" />
          <span className="text-muted-foreground">→</span>
          <input type="date" value={dateTo} min={dateFrom} onChange={(e) => e.target.value && setDateTo(e.target.value)}
            className="bg-white border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60" />
        </div>
        <Segmented<LocationFilter>
          value={locationFilter}
          onChange={setLocationFilter}
          options={[{ value: 'all', label: 'All' }, ...SHOPPER_LOCATIONS.map((l) => ({ value: l, label: l }))]}
        />
        <Segmented<ServiceFilter>
          value={serviceFilter}
          onChange={setServiceFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'Bar', label: 'Bar' }, { value: 'Table', label: 'Table' }]}
        />
        <button onClick={exportCsv} disabled={filtered.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      <div className="px-6 py-6 space-y-8 max-w-screen-2xl mx-auto">
        {demo && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Demo view — Secret Shopper visit data is hidden for this account.
          </div>
        )}
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Couldn’t load visits: {loadError}
          </div>
        )}

        {/* 01 Overview */}
        <section>
          <SectionHeader num="01" title="Overview" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Visits" value={String(overview.visits)} sub={overview.visitsSub} />
            <KpiCard label="Avg Overall Score" value={overview.score == null ? '—' : `${overview.score.toFixed(2)} / 5`} sub={overview.scoreSub} />
            <KpiCard label="Avg Ticket Time" value={fmtMinSec(overview.ticket)} sub={overview.ticketSub} />
            <KpiCard
              label="Gift Cards Pending"
              value={String(overview.pending)}
              sub={pendingOnly ? 'Showing pending in feed · click to clear' : 'Click to show in feed'}
              active={pendingOnly}
              onClick={() => {
                const next = !pendingOnly;
                setPendingOnly(next);
                if (next) setTimeout(() => document.getElementById('visit-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
            />
          </div>
        </section>

        {/* 02 Section scorecard */}
        <section>
          <SectionHeader num="02" title="Section Scorecard" />
          <Card
            title={showCompare ? 'Average rating by section — by location' : 'Average rating by section'}
            right={canCompare ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={compareLocations} onChange={(e) => setCompareLocations(e.target.checked)} className="accent-[#C8102E]" />
                Compare locations
              </label>
            ) : undefined}
          >
            {lowestSection && (
              <p className="mb-3 text-xs text-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: CRITICAL }} />
                <span className="font-semibold">Focus area:</span> {lowestSection.name} ({lowestSection.avg.toFixed(2)})
              </p>
            )}
            {filtered.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sectionData} margin={{ top: 16, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap={showCompare ? '18%' : '28%'}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={(p: { x: number; y: number; payload: { value: string } }) => (
                      <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={10}
                        fill={p.payload.value === lowestSection?.name ? CRITICAL : '#898781'}
                        fontWeight={p.payload.value === lowestSection?.name ? 700 : 400}>
                        {p.payload.value}
                      </text>
                    )}
                  />
                  <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => <ChartTip active={p.active} payload={p.payload as []} label={String(p.label)} format={scoreFmt} />} />
                  {showCompare ? (
                    <>
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#52514e' }} />
                      {compareLocationsPresent.map((loc) => (
                        <Bar key={loc} dataKey={loc} name={loc} fill={LOCATION_COLORS[loc]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      ))}
                    </>
                  ) : (
                    <Bar dataKey="avg" name="Avg rating" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56}>
                      {sectionData.map((r) => (
                        <Cell key={r.name as string} fill={r.name === lowestSection?.name ? CRITICAL : GOLD} />
                      ))}
                      <LabelList dataKey="avg" position="top" style={{ fill: '#52514e', fontSize: 10 }} formatter={(v: number | null) => (v == null ? '' : v.toFixed(1))} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </section>

        {/* 03 Location comparison */}
        <section>
          <SectionHeader num="03" title="Location Comparison" />
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2.5 sticky left-0 bg-card">Location</th>
                  <th className="text-right font-medium px-3 py-2.5">Visits</th>
                  <th className="text-right font-medium px-3 py-2.5">Overall</th>
                  {SECTIONS.map((s) => <th key={s.key} className="text-right font-medium px-3 py-2.5 whitespace-nowrap">{s.short}</th>)}
                  <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">Avg Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {locationRows.map((r) => (
                  <tr key={r.loc}>
                    <td className="px-3 py-2.5 sticky left-0 bg-card whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 font-medium text-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: LOCATION_COLORS[r.loc] }} />
                        {r.loc}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{r.visits}</td>
                    <td className={cn('px-3 py-2.5 text-right font-mono', scoreCellClass(r.overall))}>{r.overall == null ? '—' : r.overall.toFixed(2)}</td>
                    {SECTIONS.map((s) => (
                      <td key={s.key} className={cn('px-3 py-2.5 text-right font-mono', scoreCellClass(r.sections[s.key]))}>
                        {r.sections[s.key] == null ? '—' : r.sections[s.key]!.toFixed(1)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtMinSec(r.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-4 px-3 py-2 border-t text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-50 border border-green-200" /> 4.5+ strong</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-white border" /> 3.5–4.4</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-50 border border-red-200" /> Below 3.5 — needs attention</span>
              <span className="ml-auto">Date range &amp; service filters apply; all locations shown</span>
            </div>
          </div>
        </section>

        {/* 04 Ticket time */}
        <section>
          <SectionHeader num="04" title="Ticket Time" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Avg order-to-food time by week (minutes)" className="lg:col-span-2">
              {ticketWeekly.length === 0 ? <Empty text="No ticket times in this range." /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={ticketWeekly} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="week" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                    <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as []} label={`Week of ${p.label}`} format={minFmt} />} />
                    {lineLocations.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#52514e' }} />}
                    {lineLocations.map((loc) => (
                      <Line key={loc} dataKey={loc} name={loc} stroke={LOCATION_COLORS[loc]} strokeWidth={2}
                        dot={{ r: 4, fill: LOCATION_COLORS[loc], stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Distribution">
              {timedVisits.length === 0 ? <Empty text="No ticket times in this range." /> : (
                <>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={ticketBuckets} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => <ChartTip active={p.active} payload={p.payload as []} label={String(p.label)} />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#52514e' }} />
                      <Bar dataKey="timed" name="Timed" stackId="t" fill={GOLD} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                      <Bar dataKey="manual" name="Entered manually" stackId="t" fill="#E3D2B8" stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {timedCount} timed with the in-form timer · {manualCount} entered manually
                  </p>
                </>
              )}
            </Card>
          </div>
        </section>

        {/* 05 Trend */}
        <section>
          <SectionHeader num="05" title="Trend" />
          <Card title="Overall score by month">
            {monthlyTrend.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyTrend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as []} label={String(p.label)} format={scoreFmt} />} />
                  {lineLocations.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#52514e' }} />}
                  {lineLocations.map((loc) => (
                    <Line key={loc} dataKey={loc} name={loc} stroke={LOCATION_COLORS[loc]} strokeWidth={2}
                      dot={{ r: 4, fill: LOCATION_COLORS[loc], stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </section>

        {/* 06 Visit feed */}
        <section id="visit-feed" className="scroll-mt-16">
          <SectionHeader num="06" title="Visit Feed" />
          <Card
            title={pendingOnly ? `Pending gift cards (${feed.length})` : `All visits (${feed.length})`}
            right={pendingOnly ? (
              <button onClick={() => setPendingOnly(false)} className="text-xs text-primary underline underline-offset-2">Show all visits</button>
            ) : undefined}
          >
            {feed.length === 0 ? <Empty text={pendingOnly ? 'No pending gift cards.' : 'No visits in this range.'} /> : (
              <div className="divide-y">
                {feed.map((v) => {
                  const open = expandedId === v.id;
                  const repeat = (emailCounts.get(v.shopper_email) ?? 0) > 1;
                  const photos = v.media.filter((m) => m.media_type === 'photo').length;
                  const videos = v.media.filter((m) => m.media_type === 'video').length;
                  return (
                    <div key={v.id}>
                      <button onClick={() => toggleExpand(v)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1.5 px-2 py-3 text-left hover:bg-muted/50 transition-colors">
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="text-xs font-mono text-muted-foreground w-24 shrink-0">{fmtDay(v.visit_date, true)}</span>
                        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground w-32 shrink-0">
                          <span className="h-2 w-2 rounded-full" style={{ background: LOCATION_COLORS[v.location] }} />
                          {v.location}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5 text-muted-foreground shrink-0">{v.service_type}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <Stars value={v.overall_score} />
                          <span className="text-xs font-mono text-foreground">{v.overall_score == null ? '—' : v.overall_score.toFixed(2)}</span>
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">⏱ {fmtMinSec(v.ticket_time_seconds)}{v.ticket_time_source === 'manual' ? ' (manual)' : ''}</span>
                        {(photos > 0 || videos > 0) && (
                          <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            {photos > 0 && <span className="flex items-center gap-0.5"><Camera className="h-3.5 w-3.5" />{photos}</span>}
                            {videos > 0 && <span className="flex items-center gap-0.5"><Video className="h-3.5 w-3.5" />{videos}</span>}
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-2 shrink-0">
                          {repeat && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700" title={`${v.shopper_email} has submitted ${emailCounts.get(v.shopper_email)} times`}>
                              <AlertTriangle className="h-3 w-3" /> Repeat email ×{emailCounts.get(v.shopper_email)}
                            </span>
                          )}
                          <GiftBadge status={v.gift_card_status} />
                        </span>
                      </button>
                      {open && <VisitDetail visit={v} urls={mediaUrls[v.id]} />}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>

        {/* 07 Gift cards */}
        <section>
          <SectionHeader num="07" title="Gift Card Tracking" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={`Pending (${pendingCards.length})`}>
              {pendingCards.length === 0 ? <Empty text="No gift cards waiting." /> : (
                <div className="divide-y">
                  {pendingCards.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                          {v.shopper_email}
                          {(emailCounts.get(v.shopper_email) ?? 0) > 1 && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" aria-label="Repeat email" />}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{fmtDay(v.visit_date, true)} · {v.location}</p>
                      </div>
                      <button
                        onClick={() => handleMarkSent(v)}
                        disabled={demo || sendingId === v.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {sendingId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                        Mark as Sent
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={`Sent history (${sentCards.length})`}>
              {sentCards.length === 0 ? <Empty text="No gift cards sent yet." /> : (
                <div className="divide-y max-h-[420px] overflow-y-auto">
                  {sentCards.map((v) => (
                    <div key={v.id} className="py-2.5">
                      <p className="text-sm text-foreground truncate">{v.shopper_email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Visit {fmtDay(v.visit_date, true)} · {v.location} · sent {v.gift_card_sent_at ? fmtDateTime(v.gift_card_sent_at) : '—'}
                        {v.gift_card_sent_by_name ? ` by ${v.gift_card_sent_by_name}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* 08 QR code */}
        <section>
          <SectionHeader num="08" title="QR Code" />
          <div className="rounded-xl border bg-card p-5 flex flex-col sm:flex-row items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr/secret-shopper.png" alt="Secret Shopper form QR code" className="h-32 w-32 rounded-lg" />
            <div className="space-y-2 text-center sm:text-left">
              <p className="text-sm font-medium text-foreground">Secret Shopper Review Form</p>
              <a href="/secret-shopper" target="_blank" rel="noopener" className="block text-xs font-mono text-primary underline underline-offset-2 break-all">
                https://ohio-liquor-crm-opal.vercel.app/secret-shopper
              </a>
              <div className="flex flex-wrap justify-center sm:justify-start gap-3 text-xs">
                <a href="/qr/secret-shopper.png" download className="text-muted-foreground underline underline-offset-2">PNG</a>
                <a href="/qr/secret-shopper.svg" download className="text-muted-foreground underline underline-offset-2">SVG</a>
                <a href="/qr/secret-shopper-print.png" download className="text-muted-foreground underline underline-offset-2">Print PNG</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function GiftBadge({ status }: { status: 'pending' | 'sent' }) {
  return status === 'sent' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-semibold text-green-800">
      <Check className="h-3 w-3" /> Gift card sent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
      <Gift className="h-3 w-3" /> Pending
    </span>
  );
}

function VisitDetail({ visit, urls }: { visit: SecretShopperVisitRow; urls: Record<string, string> | 'loading' | 'error' | undefined }) {
  const groups: { key: SectionKey | null; title: string }[] = [
    ...SECTIONS.map((s) => ({ key: s.key, title: sectionLabel(s.key, visit.service_type) })),
    { key: null, title: 'Other media' },
  ];

  return (
    <div className="px-4 sm:px-8 pb-5 pt-1 space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Shopper: <span className="text-foreground">{visit.shopper_email}</span></span>
        <span>Submitted {fmtDateTime(visit.created_at)}</span>
        <span>
          Ticket: <span className="text-foreground">{fmtTicketTime(visit.ticket_time_seconds)}</span>
          {visit.ticket_time_source === 'timer' && visit.order_placed_at && visit.food_delivered_at && (
            <> (ordered {new Date(visit.order_placed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} → food {new Date(visit.food_delivered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})</>
          )}
          {visit.ticket_time_source === 'manual' && ' (entered manually)'}
        </span>
      </div>
      {urls === 'loading' && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading media…</p>}
      {urls === 'error' && <p className="text-xs text-red-700">Couldn’t load photos/videos for this visit.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {groups.map((g) => {
          const media = visit.media.filter((m) => m.section === g.key);
          const r = g.key ? rating(visit, g.key) : null;
          const n = g.key ? notes(visit, g.key) : null;
          if (!g.key && media.length === 0) return null;
          return (
            <div key={g.key ?? 'other'} className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-serif font-semibold text-foreground">{g.title}</p>
                {g.key && (
                  <span className="flex items-center gap-1.5">
                    <Stars value={r} />
                    <span className="text-xs font-mono text-muted-foreground w-3">{r ?? '—'}</span>
                  </span>
                )}
              </div>
              {g.key && (n ? <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{n}</p> : <p className="text-xs text-muted-foreground italic">No notes</p>)}
              {media.length > 0 && typeof urls === 'object' && (
                <div className="grid grid-cols-2 gap-2">
                  {media.map((m) => {
                    const src = urls[m.storage_path];
                    if (!src) return <div key={m.id} className="aspect-video rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">Unavailable</div>;
                    return m.media_type === 'video' ? (
                      <video key={m.id} src={src} controls playsInline preload="metadata" className="w-full aspect-video rounded bg-black object-contain col-span-2" />
                    ) : (
                      <a key={m.id} href={src} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`${g.title} photo`} className="w-full aspect-square object-cover rounded" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
