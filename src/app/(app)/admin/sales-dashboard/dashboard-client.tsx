'use client';

import { useState, useMemo } from 'react';
import type { MonthlyRow, ProductRow, WholesaleRecentRow, SalesDashboardData } from '@/app/actions/sales-dashboard';
import { RevenueOverview } from './revenue-overview';
import { RevenueChart, type RevenueChartPoint } from './revenue-chart';
import { TrendChart, type TrendSeries } from './trend-chart';
import { HotAccounts, type HotAccount } from './hot-accounts';
import { SkuLeaderboard } from './sku-leaderboard';
import { WholesaleLeaderboard } from './wholesale-leaderboard';
import { ChannelSplit } from './channel-split';

// ─── Brand families + colors ──────────────────────────────────────────────────

const FAMILY_COLORS: Record<string, string> = {
  'Vodka': '#3b82f6',
  '(614) Vodka': '#06b6d4',
  'Gin': '#22c55e',
  'Whiskey War': '#C5A572',
  'Midnight': '#8b5cf6',
  'Midnight (Discontinued)': '#7c3aed',
  'Bourbon': '#f97316',
  'RTD': '#ec4899',
  'Unknown': '#6b7280',
};
const FAMILY_COLOR_DEFAULT = '#94a3b8';

const ALL_FAMILIES = [
  'Vodka', '(614) Vodka', 'Gin', 'Whiskey War', 'Midnight', 'Bourbon', 'RTD',
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
type Channel = 'all' | 'retail' | 'wholesale';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rev(r: MonthlyRow, ch: Channel): number {
  if (ch === 'retail') return r.retail_amount;
  if (ch === 'wholesale') return r.wholesale_amount;
  return r.retail_amount + r.wholesale_amount;
}

function bot(r: MonthlyRow, ch: Channel): number {
  if (ch === 'retail') return r.retail_bottles;
  if (ch === 'wholesale') return r.wholesale_bottles;
  return r.retail_bottles + r.wholesale_bottles;
}

function inFamilies(r: { brand_family: string }, families: string[]) {
  return families.length === 0 || families.includes(r.brand_family);
}

function fmtPeriod(months: string[]): string {
  if (months.length === 0) return '';
  const [first, last] = [months[0], months[months.length - 1]];
  const fmt = (m: string) => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if (first === last) return fmt(first);
  return `${fmt(first)} – ${fmt(last)}`;
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <h2 className="text-lg font-serif font-semibold text-white tracking-wide">{children}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-[#C5A572]/30 to-transparent" />
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  selectedFamilies: string[];
  onFamilyToggle: (f: string) => void;
  channel: Channel;
  onChannel: (c: Channel) => void;
  maxMonth: string;
}

function FilterBar({ dateFrom, dateTo, onDateFrom, onDateTo, selectedFamilies, onFamilyToggle, channel, onChannel, maxMonth }: FilterBarProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-[#C5A572]/15 bg-[#0a0a0a]/95 backdrop-blur-sm px-6 py-3 flex flex-wrap gap-4 items-center">
      {/* Date range */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500 uppercase tracking-wider">Range</span>
        <input
          type="month"
          value={dateFrom}
          max={dateTo}
          onChange={(e) => onDateFrom(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-[#C5A572]/60"
        />
        <span className="text-zinc-600">→</span>
        <input
          type="month"
          value={dateTo}
          min={dateFrom}
          max={maxMonth}
          onChange={(e) => onDateTo(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none focus:border-[#C5A572]/60"
        />
      </div>

      {/* Brand family */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Family</span>
        <button
          onClick={() => ALL_FAMILIES.forEach(f => selectedFamilies.includes(f) && onFamilyToggle(f))}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${selectedFamilies.length === 0 ? 'bg-[#C5A572] text-black font-semibold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
        >
          All
        </button>
        {ALL_FAMILIES.map((f) => (
          <button
            key={f}
            onClick={() => onFamilyToggle(f)}
            className="rounded px-2 py-0.5 text-xs transition-all"
            style={{
              backgroundColor: selectedFamilies.includes(f) ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT) + '33' : 'rgb(39,39,42)',
              color: selectedFamilies.includes(f) ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT) : '#a1a1aa',
              borderWidth: 1,
              borderColor: selectedFamilies.includes(f) ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT) + '80' : 'transparent',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Channel */}
      <div className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
        {(['all', 'retail', 'wholesale'] as Channel[]).map((c) => (
          <button
            key={c}
            onClick={() => onChannel(c)}
            className={`rounded px-3 py-1 text-xs capitalize transition-colors ${channel === c ? 'bg-[#C5A572] text-black font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Section card wrapper ─────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111111] p-5">
      {children}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function DashboardClient({ data }: { data: SalesDashboardData }) {
  const { monthly, products, skuMonthly, splitRows, wholesaleRecent, wholesaleFull, accountGroups, lastUpdated } = data;

  // ── Filter state ────────────────────────────────────────────────────────────
  const maxMonth = lastUpdated ?? new Date().toISOString().slice(0, 7);
  const defaultDateTo = maxMonth;
  const defaultDateFrom = (() => {
    const d = new Date(maxMonth + '-01');
    d.setMonth(d.getMonth() - 11);
    return d.toISOString().slice(0, 7);
  })();

  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([]);
  const [channel, setChannel] = useState<Channel>('all');
  const [trendLevel, setTrendLevel] = useState<'family' | 'product'>('family');
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({});

  function handleFamilyToggle(f: string) {
    setSelectedFamilies((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  // ── Computed: current year ──────────────────────────────────────────────────
  const currentYear = useMemo(
    () => (lastUpdated ? parseInt(lastUpdated.slice(0, 4)) : new Date().getFullYear()),
    [lastUpdated]
  );
  // YTD cuts at the most-recent month in the DB for the current year
  const maxCurrentYearMonth = useMemo(
    () => monthly.filter((r) => r.month.startsWith(String(currentYear))).map((r) => r.month.slice(5, 7)).sort().pop() ?? '01',
    [monthly, currentYear]
  );

  // ── Filtered monthly (for sections 1, 2, 3) ────────────────────────────────
  const filteredMonthly = useMemo(
    () =>
      monthly.filter(
        (r) =>
          r.month >= dateFrom &&
          r.month <= dateTo &&
          inFamilies(r, selectedFamilies)
      ),
    [monthly, dateFrom, dateTo, selectedFamilies]
  );

  // ── Section 1: YTD stats ───────────────────────────────────────────────────
  const ytdStats = useMemo(() => {
    // YTD always uses FULL monthly data filtered by family (not date range)
    const ytdBase = monthly.filter((r) => inFamilies(r, selectedFamilies));
    const accum = (year: number) =>
      ytdBase
        .filter((r) => {
          const y = parseInt(r.month.slice(0, 4));
          const m = r.month.slice(5, 7);
          return y === year && m <= maxCurrentYearMonth;
        })
        .reduce((acc, r) => ({ rev: acc.rev + rev(r, channel), bot: acc.bot + bot(r, channel) }), { rev: 0, bot: 0 });

    const cur = accum(currentYear);
    const ly = accum(currentYear - 1);
    const twoLY = accum(currentYear - 2);

    const bestMonth = filteredMonthly.length > 0
      ? filteredMonthly.reduce<{ month: string; value: number } | null>((best, r) => {
          // Aggregate by month first
          return best; // placeholder — computed below
        }, null)
      : null;

    // Best month: group filtered monthly by month, sum, find max
    const byMonth = new Map<string, number>();
    for (const r of filteredMonthly) {
      byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + rev(r, channel));
    }
    let best: { month: string; value: number } | null = null;
    for (const [m, v] of byMonth) {
      if (!best || v > best.value) best = { month: m, value: v };
    }
    void bestMonth;

    return {
      revenue: { current: cur.rev, ly: ly.rev, twoLY: twoLY.rev },
      bottles: { current: cur.bot, ly: ly.bot, twoLY: twoLY.bot },
      bestMonth: best,
    };
  }, [monthly, filteredMonthly, selectedFamilies, channel, currentYear, maxCurrentYearMonth]);

  // ── Section 2: Monthly revenue chart ──────────────────────────────────────
  const chartData = useMemo<RevenueChartPoint[]>(() => {
    // Group ALL monthly data (no date range) by MM + year for overlay
    const base = monthly.filter((r) => inFamilies(r, selectedFamilies));
    const byMMYear = new Map<string, number>();
    for (const r of base) {
      const key = `${r.month.slice(5, 7)}|${r.month.slice(0, 4)}`;
      byMMYear.set(key, (byMMYear.get(key) ?? 0) + rev(r, channel));
    }
    return MONTH_LABELS.map((label, i) => {
      const mm = String(i + 1).padStart(2, '0');
      const cur = byMMYear.get(`${mm}|${currentYear}`);
      const ly = byMMYear.get(`${mm}|${currentYear - 1}`);
      const twoLY = byMMYear.get(`${mm}|${currentYear - 2}`);
      return { month: label, current: cur, ly, twoLY };
    });
  }, [monthly, selectedFamilies, channel, currentYear]);

  // ── Section 3: Trend lines ─────────────────────────────────────────────────
  const { trendSeries, trendMonths } = useMemo(() => {
    const filteredProducts: ProductRow[] = products.filter(
      (r) => r.month >= dateFrom && r.month <= dateTo && inFamilies(r, selectedFamilies)
    );
    const months = [...new Set(filteredProducts.map((r) => r.month))].sort();

    const groupKey = (r: ProductRow) =>
      trendLevel === 'family' ? r.brand_family : `${r.brand_family}||${r.product_name}`;

    // Aggregate
    const byKey = new Map<string, { byMonth: Map<string, { bottles: number; revenue: number }>; family: string; name: string }>();
    for (const r of filteredProducts) {
      const k = groupKey(r);
      if (!byKey.has(k)) {
        byKey.set(k, {
          byMonth: new Map(),
          family: r.brand_family,
          name: trendLevel === 'family' ? r.brand_family : r.product_name,
        });
      }
      const entry = byKey.get(k)!;
      const existing = entry.byMonth.get(r.month) ?? { bottles: 0, revenue: 0 };
      entry.byMonth.set(r.month, { bottles: existing.bottles + r.bottles, revenue: existing.revenue + r.revenue });
    }

    const series: TrendSeries[] = Array.from(byKey.entries()).map(([key, { byMonth, family, name }]) => {
      const total = Array.from(byMonth.values()).reduce((s, v) => s + v.bottles, 0);
      const sparkData = months.map((m) => byMonth.get(m)?.bottles ?? 0);
      const defaultVisible = trendLevel === 'family' || total > 100;
      return {
        key,
        name,
        family,
        color: FAMILY_COLORS[family] ?? FAMILY_COLOR_DEFAULT,
        sparkData,
        data: months.map((m) => ({
          month: m,
          bottles: byMonth.get(m)?.bottles ?? null,
          revenue: byMonth.get(m)?.revenue ?? null,
        })),
        totalBottles: total,
        visible: visibleSeries[key] ?? defaultVisible,
      };
    });

    series.sort((a, b) => b.totalBottles - a.totalBottles);
    return { trendSeries: series, trendMonths: months };
  }, [products, dateFrom, dateTo, selectedFamilies, trendLevel, visibleSeries]);

  function handleTrendToggle(key: string) {
    setVisibleSeries((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  // ── Section 4: Hot accounts ────────────────────────────────────────────────
  const { growing, declining, recentPeriod, priorPeriod } = useMemo(() => {
    if (!lastUpdated) return { growing: [], declining: [], recentPeriod: '', priorPeriod: '' };

    // Determine recent 3 months and prior 3 months
    const allMonths = [...new Set(wholesaleRecent.map((r) => r.month))].sort();
    const uniqueInDB = allMonths;
    const recentMonths = uniqueInDB.slice(-3);
    const priorMonths = uniqueInDB.slice(-6, -3);

    const filtered = wholesaleRecent.filter((r) => inFamilies(r, selectedFamilies));

    const sumByAgency = (months: string[]) => {
      const map = new Map<string, { bottles: number; revenue: number; name: string | null; products: Map<string, number> }>();
      for (const r of filtered) {
        if (!months.includes(r.month)) continue;
        if (!map.has(r.agency_id)) {
          map.set(r.agency_id, { bottles: 0, revenue: 0, name: r.agency_name, products: new Map() });
        }
        const entry = map.get(r.agency_id)!;
        entry.bottles += r.bottles_sold;
        entry.revenue += r.amount;
        entry.products.set(r.product_name, (entry.products.get(r.product_name) ?? 0) + r.bottles_sold);
      }
      return map;
    };

    const recentMap = sumByAgency(recentMonths);
    const priorMap = sumByAgency(priorMonths);

    const accounts: HotAccount[] = Array.from(recentMap.entries()).map(([id, r]) => {
      const p = priorMap.get(id);
      const change = r.bottles - (p?.bottles ?? 0);
      const pct = p && p.bottles > 0 ? (change / p.bottles) * 100 : null;
      const topProduct = r.products.size > 0
        ? [...r.products.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;
      return {
        agency_id: id,
        agency_name: r.name,
        recent_bottles: r.bottles,
        prior_bottles: p?.bottles ?? 0,
        bottle_change: change,
        pct_change: pct,
        top_product: topProduct,
        recent_revenue: r.revenue,
      };
    });

    // Add agencies that existed in prior but not recent (declining to 0)
    for (const [id, p] of priorMap.entries()) {
      if (!recentMap.has(id)) {
        accounts.push({
          agency_id: id,
          agency_name: p.name,
          recent_bottles: 0,
          prior_bottles: p.bottles,
          bottle_change: -p.bottles,
          pct_change: -100,
          top_product: null,
          recent_revenue: 0,
        });
      }
    }

    const growing = accounts
      .filter((a) => a.bottle_change > 0)
      .sort((a, b) => b.bottle_change - a.bottle_change)
      .slice(0, 10);

    const declining = accounts
      .filter((a) => a.bottle_change < 0)
      .sort((a, b) => a.bottle_change - b.bottle_change)
      .slice(0, 10);

    return {
      growing,
      declining,
      recentPeriod: fmtPeriod(recentMonths),
      priorPeriod: fmtPeriod(priorMonths),
    };
  }, [wholesaleRecent, selectedFamilies, lastUpdated]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0a0a0a] min-h-full text-white">
      {/* Filter bar */}
      <FilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        selectedFamilies={selectedFamilies}
        onFamilyToggle={handleFamilyToggle}
        channel={channel}
        onChannel={setChannel}
        maxMonth={maxMonth}
      />

      <div className="px-6 py-6 space-y-8 max-w-[1400px] mx-auto">
        {/* Section 1 */}
        <section>
          <SectionLabel>Revenue Overview</SectionLabel>
          <RevenueOverview
            revenue={ytdStats.revenue}
            bottles={ytdStats.bottles}
            bestMonth={ytdStats.bestMonth}
            lastUpdated={lastUpdated}
          />
        </section>

        {/* Section 1b — SKU Leaderboard */}
        <section>
          <SectionLabel>SKU Leaderboard</SectionLabel>
          <Section>
            <SkuLeaderboard
              skuMonthly={skuMonthly}
              dateFrom={dateFrom}
              dateTo={dateTo}
              selectedFamilies={selectedFamilies}
              channel={channel}
              maxMonth={maxMonth}
            />
          </Section>
        </section>

        {/* Section 1c — Wholesale Account Leaderboard */}
        <section>
          <SectionLabel>Wholesale Account Leaderboard</SectionLabel>
          <Section>
            <WholesaleLeaderboard
              wholesaleFull={wholesaleFull}
              accountGroups={accountGroups}
              dateFrom={dateFrom}
              dateTo={dateTo}
              selectedFamilies={selectedFamilies}
              maxMonth={maxMonth}
            />
          </Section>
        </section>

        {/* Section 1d — Retail vs Wholesale Split */}
        <section>
          <SectionLabel>Retail vs Wholesale Split</SectionLabel>
          <ChannelSplit
            splitRows={splitRows}
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedFamilies={selectedFamilies}
          />
        </section>

        {/* Section 2 */}
        <section>
          <SectionLabel>Monthly Revenue — Year over Year</SectionLabel>
          <Section>
            <RevenueChart data={chartData} currentYear={currentYear} />
          </Section>
        </section>

        {/* Section 3 */}
        <section>
          <SectionLabel>Monthly Trends by Product</SectionLabel>
          <Section>
            {trendMonths.length > 0 ? (
              <TrendChart
                series={trendSeries}
                months={trendMonths}
                level={trendLevel}
                onLevelChange={(l) => { setTrendLevel(l); setVisibleSeries({}); }}
                onToggle={handleTrendToggle}
              />
            ) : (
              <p className="py-8 text-center text-zinc-600 text-sm">No data for selected range.</p>
            )}
          </Section>
        </section>

        {/* Section 4 */}
        <section>
          <SectionLabel>Account Movement</SectionLabel>
          <HotAccounts
            growing={growing}
            declining={declining}
            recentPeriod={recentPeriod}
            priorPeriod={priorPeriod}
          />
        </section>
      </div>
    </div>
  );
}
