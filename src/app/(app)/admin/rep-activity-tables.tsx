'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getRepActivityData, type RepActivityData, type RepVisitRow, type RepKpiEventRow } from '@/app/actions/rep-activity';
import { computePayouts, fmtPayout } from '@/lib/kpi-payouts';

// ─── Scope: only these two reps show on the dashboard ─────────────────────────

const TARGET_REP_EMAILS = ['stoke@highbankco.com', 'pheintzman@highbankco.com'];

// ─── Week window ────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [8, 13, 26, 52] as const;

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtISODate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** Monday-start week containing the given date. */
function startOfWeekMon(d: Date): Date {
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** `n` Monday-start weeks ending with the current week, oldest first. */
function recentWeeks(n: number): Date[] {
  const curMonday = startOfWeekMon(new Date());
  const weeks: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    weeks.push(new Date(curMonday.getTime() - i * 7 * 86_400_000));
  }
  return weeks;
}

/** "Apr 13–19" or "Apr 27 – May 3" style label. */
function fmtWeekLabel(monday: Date): string {
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const mFmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (monday.getMonth() === sunday.getMonth()) {
    return `${mFmt(monday)} ${monday.getDate()}–${sunday.getDate()}`;
  }
  return `${mFmt(monday)} ${monday.getDate()} – ${mFmt(sunday)} ${sunday.getDate()}`;
}

// ─── Report-style table shell (matches the reference screenshot) ──────────────

function ReportTable({
  headers, children, totalsRow, caption,
}: {
  headers: { label: string; align?: 'left' | 'right' }[];
  children: React.ReactNode;
  totalsRow: React.ReactNode;
  caption: string;
}) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-300">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-900">
              {headers.map((h) => (
                <th
                  key={h.label}
                  className={`px-3 py-2 text-xs font-semibold text-white uppercase tracking-wide whitespace-nowrap ${
                    h.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          <tfoot>{totalsRow}</tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground italic mt-1.5">{caption}</p>
    </div>
  );
}

function ZeroFlag({ label }: { label: string }) {
  return <span className="text-red-600 font-bold text-xs">{label}</span>;
}

// ─── Weekly Visits table (one per rep) ─────────────────────────────────────────

function WeeklyVisitsTable({ repName, weeks, visits }: { repName: string; weeks: Date[]; visits: RepVisitRow[] }) {
  const rows = useMemo(() => weeks.map((monday) => {
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const from = fmtISODate(monday), to = fmtISODate(sunday);
    const weekVisits = visits.filter((v) => {
      const d = v.visited_at.slice(0, 10);
      return d >= from && d <= to;
    });
    const agency = weekVisits.filter((v) => v.account_type === 'agency').length;
    const wholesaleBar = weekVisits.filter((v) => v.account_type === 'wholesale' || v.account_type === 'Bar/Restaurant').length;
    return { monday, total: weekVisits.length, agency, wholesaleBar };
  }), [weeks, visits]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    total: t.total + r.total, agency: t.agency + r.agency, wholesaleBar: t.wholesaleBar + r.wholesaleBar,
  }), { total: 0, agency: 0, wholesaleBar: 0 }), [rows]);

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" /> {repName}
      </p>
      <ReportTable
        headers={[
          { label: 'Week' }, { label: 'Total', align: 'right' }, { label: 'Agency', align: 'right' },
          { label: 'Wholesale/Bar', align: 'right' }, { label: 'Flag' },
        ]}
        caption={`${totals.total} total visits · ${totals.agency} agency · ${totals.wholesaleBar} wholesale/bar`}
        totalsRow={
          <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
            <td className="px-3 py-2 text-foreground">TOTALS</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.total}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.agency}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.wholesaleBar}</td>
            <td className="px-3 py-2" />
          </tr>
        }
      >
        {rows.map((r) => (
          <tr key={r.monday.getTime()} className="odd:bg-white even:bg-gray-50 border-b border-gray-200">
            <td className="px-3 py-2 text-foreground whitespace-nowrap">{fmtWeekLabel(r.monday)}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.total}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.agency}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.wholesaleBar}</td>
            <td className="px-3 py-2">{r.total === 0 && <ZeroFlag label="ZERO VISITS" />}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

// ─── Weekly KPIs table (one per rep) ────────────────────────────────────────────

function WeeklyKpisTable({
  repName, weeks, events, payoutMap,
}: {
  repName: string; weeks: Date[]; events: RepKpiEventRow[]; payoutMap: Map<string, number>;
}) {
  const rows = useMemo(() => weeks.map((monday) => {
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const from = fmtISODate(monday), to = fmtISODate(sunday);
    const weekEvents = events.filter((e) => {
      const d = e.visited_at.slice(0, 10);
      return d >= from && d <= to;
    });
    const menu = weekEvents.filter((e) => e.kpi === 'Menu').length;
    const feature = weekEvents.filter((e) => e.kpi === 'Feature').length;
    const event = weekEvents.filter((e) => e.kpi === 'Event').length;
    const display = weekEvents.filter((e) => e.kpi === 'Display').length;
    const payout = weekEvents.reduce((s, e) => s + (payoutMap.get(e.id) ?? 0), 0);
    return { monday, total: weekEvents.length, menu, feature, event, display, payout };
  }), [weeks, events, payoutMap]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    total: t.total + r.total, menu: t.menu + r.menu, feature: t.feature + r.feature,
    event: t.event + r.event, display: t.display + r.display, payout: t.payout + r.payout,
  }), { total: 0, menu: 0, feature: 0, event: 0, display: 0, payout: 0 }), [rows]);

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" /> {repName}
      </p>
      <ReportTable
        headers={[
          { label: 'Week' }, { label: 'Total', align: 'right' }, { label: 'Menu', align: 'right' },
          { label: 'Feature', align: 'right' }, { label: 'Event', align: 'right' }, { label: 'Display', align: 'right' },
          { label: 'Payout', align: 'right' }, { label: 'Flag' },
        ]}
        caption={`${totals.total} total KPIs · ${fmtPayout(totals.payout)} earned`}
        totalsRow={
          <tr className="bg-gray-100 font-bold border-t-2 border-gray-400">
            <td className="px-3 py-2 text-foreground">TOTALS</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.total}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.menu}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.feature}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.event}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{totals.display}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{fmtPayout(totals.payout)}</td>
            <td className="px-3 py-2" />
          </tr>
        }
      >
        {rows.map((r) => (
          <tr key={r.monday.getTime()} className="odd:bg-white even:bg-gray-50 border-b border-gray-200">
            <td className="px-3 py-2 text-foreground whitespace-nowrap">{fmtWeekLabel(r.monday)}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.total}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.menu}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.feature}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.event}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{r.display}</td>
            <td className="px-3 py-2 text-right font-mono text-foreground">{fmtPayout(r.payout)}</td>
            <td className="px-3 py-2">{r.total === 0 && <ZeroFlag label="ZERO KPIS" />}</td>
          </tr>
        ))}
      </ReportTable>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RepActivityTables() {
  const [data, setData] = useState<RepActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekCount, setWeekCount] = useState<number>(13);

  useEffect(() => {
    getRepActivityData()
      .then(setData)
      .catch(() => setData({ reps: [], visits: [], kpiEvents: [] }))
      .finally(() => setLoading(false));
  }, []);

  const weeks = useMemo(() => recentWeeks(weekCount), [weekCount]);

  // computePayouts() dedups Display KPIs by earliest visited_at per (account,
  // month) across the FULL event set — must run globally, once, before any
  // weekly/rep bucketing, or a true first-of-month log outside a given week
  // would wrongly let a later in-week log look like the one that gets paid.
  const payoutMap = useMemo(() => (data ? computePayouts(data.kpiEvents) : new Map<string, number>()), [data]);

  const targetReps = useMemo(
    () => (data?.reps ?? []).filter((r) => TARGET_REP_EMAILS.includes(r.email)),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Users className="h-4 w-4" /> Rep Activity — Weekly
        </h2>
        <div className="flex items-center gap-1 flex-wrap">
          {WINDOW_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setWeekCount(n)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                weekCount === n ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Last {n} Weeks
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading rep activity…</CardContent></Card>
      ) : targetReps.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Samantha Toke / Paul Heintzman not found in the rep roster.</CardContent></Card>
      ) : (
        <>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Weekly Visits</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {targetReps.map((rep) => (
                <WeeklyVisitsTable
                  key={rep.id}
                  repName={rep.full_name || rep.email}
                  weeks={weeks}
                  visits={data.visits.filter((v) => v.rep_id === rep.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">Weekly KPIs</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {targetReps.map((rep) => (
                <WeeklyKpisTable
                  key={rep.id}
                  repName={rep.full_name || rep.email}
                  weeks={weeks}
                  events={data.kpiEvents.filter((e) => e.rep_id === rep.id)}
                  payoutMap={payoutMap}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
