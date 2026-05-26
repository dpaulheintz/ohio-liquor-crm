'use client';

import { useState, useMemo } from 'react';
import type { SalesDashboardData, AccountGroupData, BailmentRow } from '@/app/actions/sales-dashboard';
import { SectionRevenue } from './section-revenue';
import { SectionWholesale } from './section-wholesale';
import { SectionRetail } from './section-retail';
import { SectionHbLocations } from './section-hb-locations';
import { SectionHbWholesale } from './section-hb-wholesale';
import { SectionSkuTable } from './section-sku-table';
import { SectionBreweries } from './section-breweries';
import { WholesaleLeaderboard } from './wholesale-leaderboard';
import { ChannelSplit } from './channel-split';
import { HotAccounts, type HotAccount } from './hot-accounts';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'all' | 'retail' | 'wholesale';

// ─── Brand families + colors ──────────────────────────────────────────────────

const FAMILY_COLORS: Record<string, string> = {
  Vodka: '#3b82f6',
  '(614) Vodka': '#06b6d4',
  Gin: '#22c55e',
  'Whiskey War': '#C5A572',
  Midnight: '#8b5cf6',
  'Midnight (Discontinued)': '#7c3aed',
  Bourbon: '#f97316',
  RTD: '#ec4899',
  Misc: '#a78bfa',
  Unknown: '#6b7280',
};
const FAMILY_COLOR_DEFAULT = '#94a3b8';

const ALL_FAMILIES = [
  'Vodka', '(614) Vodka', 'Gin', 'Whiskey War', 'Midnight', 'Bourbon', 'RTD', 'Misc',
];

// ─── Account-resolution helpers (mirrors section-wholesale.tsx) ───────────────

function isHighBank(wholesaler: string | null, dba: string | null): boolean {
  const w = (wholesaler ?? '').toUpperCase();
  const d = (dba ?? '').toUpperCase();
  return w.includes('HIGH BANK') || d.includes('HIGH BANK');
}

function resolveAccount(
  wholesaler: string | null,
  dba: string | null,
  groups: AccountGroupData[]
): { key: string; displayName: string } {
  const wl = (wholesaler ?? '').toLowerCase();
  const dl = (dba ?? '').toLowerCase();
  for (const group of groups) {
    const hit = (text: string) =>
      group.match_terms.some((term) => text.includes(term.toLowerCase()));
    const matched =
      group.match_columns === 'wholesaler' ? hit(wl) :
      group.match_columns === 'dba'        ? hit(dl) :
      hit(wl) || hit(dl);
    if (matched) return { key: `group::${group.id}`, displayName: group.group_name };
  }
  const name = wholesaler?.trim() || dba?.trim() || 'Unknown Account';
  return { key: `raw::${name}`, displayName: name };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriod(months: string[]): string {
  if (months.length === 0) return '';
  const [first, last] = [months[0], months[months.length - 1]];
  const fmt = (m: string) =>
    new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
}

function inFamilies(bf: string, families: string[]) {
  return families.length === 0 || families.includes(bf);
}

// ─── Section header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  number?: number;
  title: string;
  subtitle?: string;
}

function SectionHeader({ number, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-end gap-4 mb-5">
      {number !== undefined && (
        <span className="text-4xl font-serif font-bold text-zinc-800 leading-none select-none">
          {String(number).padStart(2, '0')}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-serif font-semibold text-white tracking-wide leading-none">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-[#C5A572]/40 to-transparent max-w-[200px] mb-1" />
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

function FilterBar({
  dateFrom, dateTo, onDateFrom, onDateTo,
  selectedFamilies, onFamilyToggle, channel, onChannel, maxMonth,
}: FilterBarProps) {
  return (
    <div className="sticky top-0 z-30 border-b border-[#C5A572]/15 bg-[#0a0a0a]/95 backdrop-blur-sm px-6 py-3 flex flex-wrap gap-4 items-center">
      {/* Date range */}
      <div className="flex items-center gap-2 text-xs shrink-0">
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

      {/* Brand family toggles */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">Family</span>
        <button
          onClick={() => ALL_FAMILIES.forEach(f => selectedFamilies.includes(f) && onFamilyToggle(f))}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            selectedFamilies.length === 0
              ? 'bg-[#C5A572] text-black font-semibold'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
          }`}
        >
          All
        </button>
        {ALL_FAMILIES.map((f) => (
          <button
            key={f}
            onClick={() => onFamilyToggle(f)}
            className="rounded px-2 py-0.5 text-xs transition-all"
            style={{
              backgroundColor: selectedFamilies.includes(f)
                ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT) + '33'
                : 'rgb(39,39,42)',
              color: selectedFamilies.includes(f)
                ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT)
                : '#a1a1aa',
              borderWidth: 1,
              borderColor: selectedFamilies.includes(f)
                ? (FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT) + '80'
                : 'transparent',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Channel toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
        {(['all', 'retail', 'wholesale'] as Channel[]).map((c) => (
          <button
            key={c}
            onClick={() => onChannel(c)}
            className={`rounded px-3 py-1 text-xs capitalize transition-colors ${
              channel === c
                ? 'bg-[#C5A572] text-black font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function DashboardClient({ data }: { data: SalesDashboardData }) {
  const {
    monthly, products: _products, skuMonthly, splitRows,
    wholesaleFull, accountGroups,
    agencySkuMonthly, wholesaleSplit: _wholesaleSplit, bailmentMonthly, lastUpdated,
  } = data;
  void _products;        // available but we pass to child sections as needed
  void _wholesaleSplit;  // retained in SalesDashboardData for compat

  // ── Filter state ─────────────────────────────────────────────────────────
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

  function handleFamilyToggle(f: string) {
    setSelectedFamilies((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  // ── Derived: current year + max YTD month ────────────────────────────────
  const currentYear = useMemo(
    () => (lastUpdated ? parseInt(lastUpdated.slice(0, 4)) : new Date().getFullYear()),
    [lastUpdated],
  );
  const maxCurrentYearMonth = useMemo(
    () =>
      monthly
        .filter(r => r.month.startsWith(String(currentYear)))
        .map(r => r.month.slice(5, 7))
        .sort()
        .pop() ?? '01',
    [monthly, currentYear],
  );

  // ── Hot accounts (last 6 months vs prior 6 months) ───────────────────────
  // Uses wholesaleFull (has wholesaler_name/dba) so accounts resolve correctly.
  // Groups by actual buyer identity, not agency_id (avoids the J Liu bug).
  const { growing, declining, recentPeriod, priorPeriod } = useMemo(() => {
    if (!lastUpdated) return { growing: [], declining: [], recentPeriod: '', priorPeriod: '' };

    // Take last 6 distinct months present in wholesaleFull
    const allMonths = [...new Set(wholesaleFull.map(r => r.month))].sort().slice(-6);
    const recentMonths = allMonths.slice(-3);
    const priorMonths = allMonths.slice(0, 3);

    // Pre-filter: 6-month window + family filter + exclude HB accounts
    const filtered = wholesaleFull.filter(r =>
      allMonths.includes(r.month) &&
      inFamilies(r.brand_family, selectedFamilies) &&
      !isHighBank(r.wholesaler_name, r.dba)
    );

    const sumByAccount = (months: string[]) => {
      const map = new Map<
        string,
        { bottles: number; revenue: number; name: string; products: Map<string, number> }
      >();
      for (const r of filtered) {
        if (!months.includes(r.month)) continue;
        const resolved = resolveAccount(r.wholesaler_name, r.dba, accountGroups);
        if (!map.has(resolved.key)) {
          map.set(resolved.key, { bottles: 0, revenue: 0, name: resolved.displayName, products: new Map() });
        }
        const entry = map.get(resolved.key)!;
        entry.bottles += r.bottles_sold;
        entry.revenue += r.amount;
        entry.products.set(r.product_name, (entry.products.get(r.product_name) ?? 0) + r.bottles_sold);
      }
      return map;
    };

    const recentMap = sumByAccount(recentMonths);
    const priorMap = sumByAccount(priorMonths);

    const accounts: HotAccount[] = Array.from(recentMap.entries()).map(([key, r]) => {
      const p = priorMap.get(key);
      const change = r.bottles - (p?.bottles ?? 0);
      const pct = p && p.bottles > 0 ? (change / p.bottles) * 100 : null;
      const topProduct =
        r.products.size > 0
          ? [...r.products.entries()].sort((a, b) => b[1] - a[1])[0][0]
          : null;
      return {
        account_key: key,
        account_name: r.name,
        recent_bottles: r.bottles,
        prior_bottles: p?.bottles ?? 0,
        bottle_change: change,
        pct_change: pct,
        top_product: topProduct,
        recent_revenue: r.revenue,
      };
    });

    // Add accounts that were in prior but disappeared from recent
    for (const [key, p] of priorMap.entries()) {
      if (!recentMap.has(key)) {
        accounts.push({
          account_key: key,
          account_name: p.name,
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
      .filter(a => a.bottle_change > 0)
      .sort((a, b) => b.bottle_change - a.bottle_change)
      .slice(0, 10);
    const declining = accounts
      .filter(a => a.bottle_change < 0)
      .sort((a, b) => a.bottle_change - b.bottle_change)
      .slice(0, 10);

    return {
      growing,
      declining,
      recentPeriod: fmtPeriod(recentMonths),
      priorPeriod: fmtPeriod(priorMonths),
    };
  }, [wholesaleFull, accountGroups, selectedFamilies, lastUpdated]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0a0a0a] min-h-full text-white">
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

      <div className="px-6 py-8 space-y-12 max-w-[1400px] mx-auto">

        {/* ── Section 1: Revenue Overview ─────────────────────────────────── */}
        <section>
          <SectionHeader
            number={1}
            title="Revenue Overview"
            subtitle="YTD performance, year-over-year comparison, and brand family breakdown"
          />
          <SectionRevenue
            monthly={monthly}
            splitRows={splitRows}
            bailmentMonthly={bailmentMonthly}
            selectedFamilies={selectedFamilies}
            channel={channel}
            dateFrom={dateFrom}
            dateTo={dateTo}
            currentYear={currentYear}
            maxCurrentYearMonth={maxCurrentYearMonth}
            lastUpdated={lastUpdated}
          />
        </section>

        {/* ── SKU Revenue Breakdown ────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="SKU Revenue Breakdown"
            subtitle="Every SKU ranked by revenue with monthly sparklines — sortable and exportable"
          />
          <SectionSkuTable
            skuMonthly={skuMonthly}
            selectedFamilies={selectedFamilies}
            channel={channel}
            dateFrom={dateFrom}
            dateTo={maxMonth}
          />
        </section>

        {/* ── Section 2: Wholesale ────────────────────────────────────────── */}
        <section>
          <SectionHeader
            number={2}
            title="Wholesale Bottles Sold"
            subtitle="Distribution channel — top accounts, SKU performance, and volume by family"
          />
          <SectionWholesale
            monthly={monthly}
            wholesaleFull={wholesaleFull}
            accountGroups={accountGroups}
            selectedFamilies={selectedFamilies}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* ── Brewery Accounts ────────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Brewery Accounts"
            subtitle="Named brewery partners ranked by wholesale bottle volume"
          />
          <SectionBreweries
            wholesaleFull={wholesaleFull}
            accountGroups={accountGroups}
            selectedFamilies={selectedFamilies}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* ── Section 3: Retail ───────────────────────────────────────────── */}
        <section>
          <SectionHeader
            number={3}
            title="Retail Sales"
            subtitle="Direct consumer sales — revenue trend, brand mix, and top-moving products"
          />
          <SectionRetail
            monthly={monthly}
            skuMonthly={skuMonthly}
            agencySkuMonthly={agencySkuMonthly}
            selectedFamilies={selectedFamilies}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* ── Section 4: High Bank Locations ──────────────────────────────── */}
        <section>
          <SectionHeader
            number={4}
            title="High Bank Locations"
            subtitle="Revenue and volume breakdown across Grandview, Gahanna, and Westerville"
          />
          <SectionHbLocations
            splitRows={splitRows}
            selectedFamilies={selectedFamilies}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* ── Section 5: HB Bar Sales ─────────────────────────────────────── */}
        <section>
          <SectionHeader
            number={5}
            title="HB Bar Sales"
            subtitle="Wholesale orders placed by High Bank's own bar locations"
          />
          <SectionHbWholesale
            splitRows={splitRows}
            selectedFamilies={selectedFamilies}
            dateFrom={dateFrom}
            dateTo={dateTo}
          />
        </section>

        {/* ── Retail vs Wholesale Split ────────────────────────────────────── */}
        <section>
          <SectionHeader title="Retail vs Wholesale Split" subtitle="Channel breakdown by brand family with HB agency drill-down" />
          <ChannelSplit
            splitRows={splitRows}
            dateFrom={dateFrom}
            dateTo={dateTo}
            selectedFamilies={selectedFamilies}
          />
        </section>

        {/* ── Wholesale Account Leaderboard ────────────────────────────────── */}
        <section>
          <SectionHeader title="Wholesale Account Leaderboard" subtitle="Ranked accounts with group rollup, HB badge, and per-SKU view" />
          <div className="rounded-xl border border-zinc-800 bg-[#111111] p-5">
            <WholesaleLeaderboard
              wholesaleFull={wholesaleFull}
              accountGroups={accountGroups}
              dateFrom={dateFrom}
              dateTo={dateTo}
              selectedFamilies={selectedFamilies}
              maxMonth={maxMonth}
            />
          </div>
        </section>

        {/* ── Account Movement ─────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="Account Movement" subtitle="Fastest growing and declining wholesale accounts over the last 6 months" />
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
