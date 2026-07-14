'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRepActivityData, type RepActivityData } from '@/app/actions/rep-activity';
import { computePayouts, quarterOf, quarterRange, currentQuarterOption, fmtPayout } from '@/lib/kpi-payouts';

// ─── Period ───────────────────────────────────────────────────────────────────

type Period = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter';

const PERIOD_LABELS: { value: Period; label: string }[] = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** Monday-start week, matching the report style this feature replicates. */
function startOfWeekMon(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function getPeriodRange(period: Period): { from: string; to: string } {
  const now = new Date();

  if (period === 'this_week' || period === 'last_week') {
    const thisWeekStart = startOfWeekMon(now);
    const start = period === 'this_week' ? thisWeekStart : new Date(thisWeekStart.getTime() - 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    return { from: fmtDate(start), to: fmtDate(end) };
  }

  if (period === 'this_month' || period === 'last_month') {
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed
    const targetM = period === 'this_month' ? m : m - 1;
    const start = new Date(y, targetM, 1);
    const end = new Date(y, targetM + 1, 0);
    return { from: fmtDate(start), to: fmtDate(end) };
  }

  // Quarters — reuse the shared quarter math from kpi-payouts.ts
  if (period === 'this_quarter') {
    const q = currentQuarterOption();
    return { from: q.from, to: q.to };
  }
  const curQ = quarterOf(now);
  const lastQ = curQ === 1 ? 4 : ((curQ - 1) as 1 | 2 | 3 | 4);
  const lastYear = curQ === 1 ? now.getFullYear() - 1 : now.getFullYear();
  return quarterRange(lastYear, lastQ);
}

// ─── Shared table bits ────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function SortableHeader<Col extends string>({
  col, label, sortBy, sortDir, onSort, align = 'right',
}: {
  col: Col; label: string; sortBy: Col; sortDir: SortDir;
  onSort: (col: Col) => void; align?: 'left' | 'right';
}) {
  const active = sortBy === col;
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        <Icon className="h-3 w-3" />
      </span>
    </th>
  );
}

function ZeroFlag({ label }: { label: string }) {
  return <Badge variant="destructive" className="text-[10px]">{label}</Badge>;
}

// ─── Table 1: Visits by Rep ───────────────────────────────────────────────────

interface VisitSummaryRow {
  repId: string; name: string;
  total: number; agency: number; wholesaleBar: number; uniqueAccounts: number;
}

type VisitSortCol = 'total' | 'agency' | 'wholesaleBar' | 'uniqueAccounts';

function VisitsByRepTable({ data, from, to }: { data: RepActivityData; from: string; to: string }) {
  const [sortBy, setSortBy] = useState<VisitSortCol>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(col: VisitSortCol) {
    if (col === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('desc'); }
  }

  const rows: VisitSummaryRow[] = useMemo(() => {
    const inRange = data.visits.filter((v) => {
      const d = v.visited_at.slice(0, 10);
      return d >= from && d <= to;
    });
    return data.reps.map((rep) => {
      const repVisits = inRange.filter((v) => v.rep_id === rep.id);
      const agency = repVisits.filter((v) => v.account_type === 'agency').length;
      const wholesaleBar = repVisits.filter((v) => v.account_type === 'wholesale' || v.account_type === 'Bar/Restaurant').length;
      const uniqueAccounts = new Set(repVisits.map((v) => v.account_id)).size;
      return {
        repId: rep.id, name: rep.full_name || rep.email,
        total: repVisits.length, agency, wholesaleBar, uniqueAccounts,
      };
    });
  }, [data, from, to]);

  const sorted = useMemo(() => {
    const s = [...rows].sort((a, b) => (a[sortBy] - b[sortBy]) * (sortDir === 'asc' ? 1 : -1));
    return s;
  }, [rows, sortBy, sortDir]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    total: t.total + r.total, agency: t.agency + r.agency,
    wholesaleBar: t.wholesaleBar + r.wholesaleBar, uniqueAccounts: t.uniqueAccounts + r.uniqueAccounts,
  }), { total: 0, agency: 0, wholesaleBar: 0, uniqueAccounts: 0 }), [rows]);

  return (
    <div className="overflow-x-auto rounded-lg border border">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="bg-muted border-b border">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground select-none">Rep</th>
            <SortableHeader col="total" label="Total Visits" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="agency" label="Agency" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="wholesaleBar" label="Wholesale/Bar" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="uniqueAccounts" label="Unique Accounts" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground select-none">Flag</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">No reps found.</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.repId} className="border-b border/50 hover:bg-white/40 transition-colors">
                <td className="px-3 py-2.5 font-medium text-foreground">{r.name}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">{r.total}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.agency}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.wholesaleBar}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.uniqueAccounts}</td>
                <td className="px-3 py-2.5">{r.total === 0 && <ZeroFlag label="No visits" />}</td>
              </tr>
            ))
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-primary/30 bg-card font-semibold">
              <td className="px-3 py-2.5 text-foreground">TOTAL</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.total}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.agency}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.wholesaleBar}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.uniqueAccounts}</td>
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Table 2: KPIs by Rep ──────────────────────────────────────────────────────

interface KpiSummaryRow {
  repId: string; name: string;
  menu: number; feature: number; event: number; display: number; total: number; payout: number;
}

type KpiSortCol = 'menu' | 'feature' | 'event' | 'display' | 'total' | 'payout';

function KpisByRepTable({ data, from, to }: { data: RepActivityData; from: string; to: string }) {
  const [sortBy, setSortBy] = useState<KpiSortCol>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(col: KpiSortCol) {
    if (col === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('desc'); }
  }

  // Payouts must be computed over the FULL, unfiltered event set — computePayouts()
  // dedups Display KPIs by the earliest visited_at per (account, month). If we
  // filtered to the selected period first, a true first-of-month Display log that
  // falls outside the period would be excluded from its dedup group, wrongly
  // making a later in-period log look like the one that gets paid. Compute once
  // globally, then filter the resulting per-event payout map down to the period.
  const payoutMap = useMemo(() => computePayouts(data.kpiEvents), [data.kpiEvents]);

  const rows: KpiSummaryRow[] = useMemo(() => {
    const inRange = data.kpiEvents.filter((e) => {
      const d = e.visited_at.slice(0, 10);
      return d >= from && d <= to;
    });
    return data.reps.map((rep) => {
      const repEvents = inRange.filter((e) => e.rep_id === rep.id);
      const menu = repEvents.filter((e) => e.kpi === 'Menu').length;
      const feature = repEvents.filter((e) => e.kpi === 'Feature').length;
      const event = repEvents.filter((e) => e.kpi === 'Event').length;
      const display = repEvents.filter((e) => e.kpi === 'Display').length;
      const payout = repEvents.reduce((s, e) => s + (payoutMap.get(e.id) ?? 0), 0);
      return {
        repId: rep.id, name: rep.full_name || rep.email,
        menu, feature, event, display, total: repEvents.length, payout,
      };
    });
  }, [data, from, to, payoutMap]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (a[sortBy] - b[sortBy]) * (sortDir === 'asc' ? 1 : -1)), [rows, sortBy, sortDir]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    menu: t.menu + r.menu, feature: t.feature + r.feature, event: t.event + r.event,
    display: t.display + r.display, total: t.total + r.total, payout: t.payout + r.payout,
  }), { menu: 0, feature: 0, event: 0, display: 0, total: 0, payout: 0 }), [rows]);

  return (
    <div className="overflow-x-auto rounded-lg border border">
      <table className="w-full text-sm border-collapse min-w-[720px]">
        <thead>
          <tr className="bg-muted border-b border">
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground select-none">Rep</th>
            <SortableHeader col="menu" label="Menu" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="feature" label="Feature" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="event" label="Event" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="display" label="Display" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="total" label="Total KPIs" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader col="payout" label="Payout" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground select-none">Flag</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={8} className="py-10 text-center text-muted-foreground text-sm">No reps found.</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.repId} className="border-b border/50 hover:bg-white/40 transition-colors">
                <td className="px-3 py-2.5 font-medium text-foreground">{r.name}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.menu}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.feature}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.event}</td>
                <td className="px-3 py-2.5 text-right font-mono text-foreground">{r.display}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">{r.total}</td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">{fmtPayout(r.payout)}</td>
                <td className="px-3 py-2.5">{r.total === 0 && <ZeroFlag label="No KPIs" />}</td>
              </tr>
            ))
          )}
        </tbody>
        {sorted.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-primary/30 bg-card font-semibold">
              <td className="px-3 py-2.5 text-foreground">TOTAL</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.menu}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.feature}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.event}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.display}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{totals.total}</td>
              <td className="px-3 py-2.5 text-right font-mono text-foreground">{fmtPayout(totals.payout)}</td>
              <td className="px-3 py-2.5" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RepActivityTables() {
  const [data, setData] = useState<RepActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this_week');

  useEffect(() => {
    getRepActivityData()
      .then(setData)
      .catch(() => setData({ reps: [], visits: [], kpiEvents: [] }))
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = useMemo(() => getPeriodRange(period), [period]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Users className="h-4 w-4" /> Rep Activity
        </h2>
        <div className="flex items-center gap-1 flex-wrap">
          {PERIOD_LABELS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                period === p.value ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading rep activity…</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Visits by Rep</CardTitle>
            </CardHeader>
            <CardContent>
              <VisitsByRepTable data={data} from={from} to={to} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">KPIs by Rep</CardTitle>
            </CardHeader>
            <CardContent>
              <KpisByRepTable data={data} from={from} to={to} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
