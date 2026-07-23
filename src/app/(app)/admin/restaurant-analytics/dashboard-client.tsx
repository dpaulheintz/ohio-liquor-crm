'use client';

import { useState, useMemo } from 'react';
import {
  GOLD, LOCATIONS, monthsBetween, shiftMonth, monthLabelYear, monthLabelFull, ymOf,
  weekLabel, shiftDay,
  type DailyRow, type InvoiceMonth, type LocationName, type LocationTab, type PrimeCostRow, type ItemWeekRow,
} from './lib';
import { KpiCards, type KpiData } from './kpi-cards';
import { RevenueChart, type MonthPoint } from './revenue-chart';
import { LocationScorecard, type LocationStat } from './location-scorecard';
import { DailyHeatmap } from './daily-heatmap';
import { PrimeCostPanel, type PrimeCostData } from './prime-cost-panel';
import { InvoiceSpend, type InvoiceSpendData } from './invoice-spend';
import { RevenueByStore } from './revenue-by-store';
import { FunFacts } from './fun-facts';

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground shrink-0">{num}</span>
      <h2 className="font-serif text-base font-semibold text-foreground tracking-wide">{title}</h2>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${GOLD}55, transparent)` }} />
    </div>
  );
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function sumField(rows: DailyRow[], field: 'total' | 'fnb' | 'guests' | 'checks' | 'labor'): number {
  let s = 0;
  for (const r of rows) s += r[field];
  return s;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface RestaurantDashboardClientProps {
  rows: DailyRow[];
  invoiceMonths: InvoiceMonth[];
  weeklyPrimeCost: PrimeCostRow[];
  monthlyPrimeCost: PrimeCostRow[];
  itemWeeks: ItemWeekRow[];
  dataThrough: string | null;
}

const TABS: LocationTab[] = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21', 'All'];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RestaurantDashboardClient({
  rows, invoiceMonths, weeklyPrimeCost, monthlyPrimeCost, itemWeeks, dataThrough,
}: RestaurantDashboardClientProps) {
  // All distinct months present, ascending.
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(ymOf(r.date));
    return [...set].sort();
  }, [rows]);

  const latestMonth = allMonths[allMonths.length - 1] ?? '2026-01';
  const earliestMonth = allMonths[0] ?? '2024-01';

  // ── State ──
  const [location, setLocation] = useState<LocationTab>('All');
  const [rangeFrom, setRangeFrom] = useState<string>(() => {
    const start = shiftMonth(latestMonth, -11);
    return start < earliestMonth ? earliestMonth : start;
  });
  const [rangeTo, setRangeTo] = useState<string>(latestMonth);
  const [heatmapMonth, setHeatmapMonth] = useState<string>(latestMonth);

  // Months spanned by the active range.
  const rangeMonths = useMemo(() => monthsBetween(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

  // Keep the heatmap month inside the active range. `heatmapMonth` is only ever
  // set from the in-range <select>, so falling back here (rather than in an
  // effect) covers the case where the range shrinks past the current selection.
  const effHeatmapMonth = rangeMonths.includes(heatmapMonth)
    ? heatmapMonth
    : rangeMonths[rangeMonths.length - 1];

  // Rows filtered by the selected location (not by date — date filtering per section).
  const locRows = useMemo(
    () => (location === 'All' ? rows : rows.filter((r) => r.location === location)),
    [rows, location],
  );

  // ── KPI aggregates (current range vs same range prior year) ──
  const kpi: KpiData = useMemo(() => {
    const inRange = (ym: string) => ym >= rangeFrom && ym <= rangeTo;
    const priorFrom = shiftMonth(rangeFrom, -12);
    const priorTo = shiftMonth(rangeTo, -12);
    const inPrior = (ym: string) => ym >= priorFrom && ym <= priorTo;

    const cur = locRows.filter((r) => inRange(ymOf(r.date)));
    const prior = locRows.filter((r) => inPrior(ymOf(r.date)));

    const totalRevenue = sumField(cur, 'total');
    const fnbRevenue = sumField(cur, 'fnb');
    const guestCount = sumField(cur, 'guests');
    const priorRevenueRaw = sumField(prior, 'total');
    const priorGuestRaw = sumField(prior, 'guests');

    return {
      totalRevenue,
      priorRevenue: prior.length > 0 ? priorRevenueRaw : null,
      guestCount,
      priorGuestCount: prior.length > 0 ? priorGuestRaw : null,
      avgCheck: guestCount > 0 ? totalRevenue / guestCount : 0,
      fnbRevenue,
      retailRevenue: Math.max(0, totalRevenue - fnbRevenue),
    };
  }, [locRows, rangeFrom, rangeTo]);

  // ── Monthly chart points (current vs prior-year) ──
  const chartPoints: MonthPoint[] = useMemo(() => {
    // Pre-bucket revenue by month for the selected location.
    const byMonth: Record<string, number> = {};
    for (const r of locRows) {
      const ym = ymOf(r.date);
      byMonth[ym] = (byMonth[ym] ?? 0) + r.total;
    }
    return rangeMonths.map((ym) => {
      const priorYm = shiftMonth(ym, -12);
      return {
        label: monthLabelYear(ym),
        cur: byMonth[ym] ?? null,
        prior: byMonth[priorYm] ?? null,
      };
    });
  }, [locRows, rangeMonths]);

  // ── Location scorecard (all locations over the range) ──
  const scorecard: LocationStat[] = useMemo(() => {
    const inRange = (ym: string) => ym >= rangeFrom && ym <= rangeTo;
    return LOCATIONS.map((loc) => {
      const r = rows.filter((row) => row.location === loc && inRange(ymOf(row.date)));
      const revenue = sumField(r, 'total');
      const guests = sumField(r, 'guests');
      return { location: loc, revenue, guests, avgCheck: guests > 0 ? revenue / guests : 0 };
    });
  }, [rows, rangeFrom, rangeTo]);

  // ── Prime cost panel (invoice-based, from weekly/monthly_prime_cost views) ──
  // Driven by the selected location tab. The current partial week/month is
  // excluded so lumpy invoice timing doesn't distort the latest data point.
  const primeCost: PrimeCostData = useMemo(() => {
    const selKey: LocationName | 'All' = location; // tab already matches view labels
    const weekRows = weeklyPrimeCost.filter((r) => r.location === selKey);
    const monthRows = monthlyPrimeCost.filter((r) => r.location === selKey);

    // Completeness cutoffs from the latest available sales date.
    const through = dataThrough ?? '';
    const currentMonth = through ? ymOf(through) : '';

    // A week is complete when its Sunday (Monday+6) is on/before `through`;
    // a month is complete when it's strictly before the month of `through`.
    const completeWeeks = weekRows.filter((r) => !through || shiftDay(r.periodStart, 6) <= through);
    const completeMonths = monthRows.filter((r) => !currentMonth || ymOf(r.periodStart) < currentMonth);

    const weekly = completeWeeks.slice(-12).map((r) => ({
      label: weekLabel(r.periodStart),
      prime: r.primePct,
    }));
    const monthly = completeMonths.slice(-12).map((r) => ({
      label: monthLabelYear(ymOf(r.periodStart)),
      prime: r.primePct,
    }));

    const latest = completeMonths[completeMonths.length - 1];
    const headline = latest
      ? {
          periodLabel: monthLabelFull(ymOf(latest.periodStart)),
          prime: latest.primePct,
          cogs: latest.cogs,
          labor: latest.labor,
          revenue: latest.revenue,
        }
      : null;

    return { weekly, monthly, headline, hasData: weekly.length > 0 || monthly.length > 0 };
  }, [weeklyPrimeCost, monthlyPrimeCost, location, dataThrough]);

  // ── Invoice spend ──
  const invoiceSpend: InvoiceSpendData = useMemo(() => {
    const inRange = (ym: string) => ym >= rangeFrom && ym <= rangeTo;
    const relevant = invoiceMonths.filter(
      (i) => inRange(i.month) && (location === 'All' || i.location === location),
    );
    const byMonth: Record<string, { food: number; bev: number; unclassified: number; total: number }> = {};
    for (const i of relevant) {
      const m = (byMonth[i.month] ??= { food: 0, bev: 0, unclassified: 0, total: 0 });
      m.food += i.food; m.bev += i.bev; m.unclassified += i.unclassified; m.total += i.total;
    }
    const monthly = rangeMonths.map((ym) => {
      const m = byMonth[ym] ?? { food: 0, bev: 0, unclassified: 0, total: 0 };
      return { label: monthLabelYear(ym), food: m.food, bev: m.bev, other: m.unclassified, total: m.total };
    });
    const ytd = monthly.reduce(
      (s, m) => ({ food: s.food + m.food, bev: s.bev + m.bev, other: s.other + m.other, total: s.total + m.total }),
      { food: 0, bev: 0, other: 0, total: 0 },
    );
    return { monthly, ytd };
  }, [invoiceMonths, location, rangeFrom, rangeTo, rangeMonths]);

  // ── Daily heatmap data for the chosen month ──
  const { dayRevenue, maxRevenue } = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of locRows) {
      if (ymOf(r.date) !== effHeatmapMonth) continue;
      const day = Number(r.date.slice(8, 10));
      map[day] = (map[day] ?? 0) + r.total;
    }
    const max = Object.values(map).reduce((m, v) => (v > m ? v : m), 0);
    return { dayRevenue: map, maxRevenue: max };
  }, [locRows, effHeatmapMonth]);

  const dataThroughLabel = dataThrough
    ? new Date(dataThrough + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // ── Render ──
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Page header */}
      <div className="border-b border-primary/15 px-6 py-5">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-wide text-foreground">
              Restaurant Analytics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
              High Bank Distillery — Sales Performance
            </p>
          </div>
          {dataThroughLabel && (
            <span className="text-xs text-muted-foreground font-mono">
              Data through {dataThroughLabel}
            </span>
          )}
        </div>
      </div>

      {/* Sticky controls */}
      <div className="sticky top-0 z-30 border-b border-primary/15 bg-background/95 backdrop-blur-sm px-6 py-3 space-y-2.5">
        {/* Location tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0 w-16">Location</span>
          <div className="flex items-center gap-1 flex-wrap">
            {TABS.map((tab) => {
              const active = location === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setLocation(tab)}
                  className="rounded px-3 py-1 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: active ? GOLD : 'var(--muted, #f1f1f1)',
                    color: active ? '#000' : '#71717a',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: active ? GOLD : 'transparent',
                  }}
                >
                  {tab === 'All' ? 'All Locations' : tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Month range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0 w-16">Range</span>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value > rangeTo ? rangeTo : e.target.value)}
              className="bg-white border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60"
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>{monthLabelFull(m)}</option>
              ))}
            </select>
            <span className="text-muted-foreground">→</span>
            <select
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value < rangeFrom ? rangeFrom : e.target.value)}
              className="bg-white border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary/60"
            >
              {allMonths.map((m) => (
                <option key={m} value={m}>{monthLabelFull(m)}</option>
              ))}
            </select>
          </div>
          {/* Quick range presets */}
          <div className="flex items-center gap-1">
            {([['12M', 11], ['6M', 5], ['3M', 2]] as const).map(([label, back]) => (
              <button
                key={label}
                onClick={() => {
                  const start = shiftMonth(latestMonth, -back);
                  setRangeFrom(start < earliestMonth ? earliestMonth : start);
                  setRangeTo(latestMonth);
                }}
                className="rounded px-2 py-1 text-[11px] font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => { setRangeFrom(earliestMonth); setRangeTo(latestMonth); }}
              className="rounded px-2 py-1 text-[11px] font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="px-6 py-6 space-y-8 max-w-screen-2xl mx-auto">
        <section>
          <SectionHeader num="01" title="Key Metrics" />
          <KpiCards data={kpi} />
        </section>

        <section>
          <SectionHeader num="02" title="Prime Cost (Invoice-Based)" />
          <PrimeCostPanel data={primeCost} />
        </section>

        <section>
          <SectionHeader num="03" title="Revenue by Store" />
          <RevenueByStore rows={rows} dataThrough={dataThrough} />
        </section>

        <section>
          <SectionHeader num="04" title="Monthly Revenue" />
          <RevenueChart
            points={chartPoints}
            curLabel={location === 'All' ? 'All Locations' : location}
            priorLabel="Prior year"
          />
        </section>

        {location === 'All' && (
          <section>
            <SectionHeader num="05" title="Location Scorecard" />
            <LocationScorecard stats={scorecard} />
          </section>
        )}

        <section>
          <SectionHeader num={location === 'All' ? '06' : '05'} title="Invoice Spend" />
          <InvoiceSpend data={invoiceSpend} />
        </section>

        <section>
          <SectionHeader num={location === 'All' ? '07' : '06'} title="Daily Revenue" />
          <DailyHeatmap
            month={effHeatmapMonth}
            monthOptions={rangeMonths}
            onSelectMonth={setHeatmapMonth}
            dayRevenue={dayRevenue}
            maxRevenue={maxRevenue}
          />
        </section>

        <section>
          <SectionHeader num={location === 'All' ? '08' : '07'} title="Fun Facts" />
          <FunFacts rows={rows} itemWeeks={itemWeeks} dataThrough={dataThrough} />
        </section>
      </div>
    </div>
  );
}
