'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import type { SplitRow } from '@/app/actions/sales-dashboard';

// ─── Constants ────────────────────────────────────────────────────────────────

const HB_LOCATIONS = ['Grandview', 'Gahanna', 'Westerville'] as const;
type HbLocation = (typeof HB_LOCATIONS)[number];

const LOCATION_COLORS: Record<HbLocation, string> = {
  Grandview: '#C5A572',
  Gahanna: '#f97316',
  Westerville: '#22c55e',
};

const FAMILY_COLORS: Record<string, string> = {
  Vodka: '#3b82f6',
  '(614) Vodka': '#06b6d4',
  Gin: '#22c55e',
  'Whiskey War': '#C5A572',
  Midnight: '#8b5cf6',
  'Midnight (Discontinued)': '#7c3aed',
  Bourbon: '#f97316',
  RTD: '#ec4899',
  Unknown: '#6b7280',
};
const FAMILY_COLOR_DEFAULT = '#94a3b8';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtBottles(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold text-white leading-none">{value}</span>
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: any[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-zinc-400 mb-1.5 border-b border-zinc-800 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">
            {fmt ? fmt(p.value ?? 0) : (p.value ?? 0).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionHbWholesaleProps {
  splitRows: SplitRow[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionHbWholesale({
  splitRows, selectedFamilies, dateFrom, dateTo,
}: SectionHbWholesaleProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // HB wholesale only: is_hb_agency=true, wholesale_bottles > 0
  const hbWholesale = useMemo(
    () =>
      splitRows.filter(
        r =>
          r.is_hb_agency &&
          r.hb_location &&
          r.month >= dateFrom &&
          r.month <= dateTo &&
          inFam(r.brand_family),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitRows, selectedFamilies, dateFrom, dateTo],
  );

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let bottles = 0, revenue = 0;
    for (const r of hbWholesale) {
      bottles += r.wholesale_bottles;
      revenue += r.wholesale_amount;
    }
    return { bottles, revenue };
  }, [hbWholesale]);

  // ── Monthly trend per location (wholesale only) ────────────────────────────
  const trendData = useMemo(() => {
    const mmap = new Map<string, Record<string, number>>();
    for (const r of hbWholesale) {
      const loc = r.hb_location!;
      const e = mmap.get(r.month) ?? {};
      e[loc] = (e[loc] ?? 0) + r.wholesale_bottles;
      mmap.set(r.month, e);
    }
    const result: Record<string, string | number>[] = [];
    const d = new Date(dateFrom + '-01');
    const end = new Date(dateTo + '-01');
    while (d <= end) {
      const key = d.toISOString().slice(0, 7);
      const row: Record<string, string | number> = {
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
      const data = mmap.get(key) ?? {};
      for (const loc of HB_LOCATIONS) row[loc] = data[loc] ?? null;
      result.push(row);
      d.setMonth(d.getMonth() + 1);
    }
    return result;
  }, [hbWholesale, dateFrom, dateTo]);

  // ── Product mix pie (wholesale bottles by brand family) ────────────────────
  const productMix = useMemo(() => {
    const fmap = new Map<string, number>();
    for (const r of hbWholesale) {
      fmap.set(r.brand_family, (fmap.get(r.brand_family) ?? 0) + r.wholesale_bottles);
    }
    return [...fmap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [hbWholesale]);
  const mixTotal = productMix.reduce((s, r) => s + r.value, 0);

  // ── Top products by wholesale bottles ─────────────────────────────────────
  const topProducts = useMemo(() => {
    const pmap = new Map<string, { name: string; bottles: number; family: string }>();
    for (const r of hbWholesale) {
      const e = pmap.get(r.product_name) ?? {
        name: r.product_name,
        bottles: 0,
        family: r.brand_family,
      };
      e.bottles += r.wholesale_bottles;
      pmap.set(r.product_name, e);
    }
    return [...pmap.values()].sort((a, b) => b.bottles - a.bottles).slice(0, 10);
  }, [hbWholesale]);

  // ── Per-location wholesale breakdown ──────────────────────────────────────
  const locationBreakdown = useMemo(() => {
    return HB_LOCATIONS.map(loc => {
      const rows = hbWholesale.filter(r => r.hb_location === loc);
      const bottles = rows.reduce((s, r) => s + r.wholesale_bottles, 0);
      const revenue = rows.reduce((s, r) => s + r.wholesale_amount, 0);
      return { loc, bottles, revenue };
    });
  }, [hbWholesale]);

  const hasData = hbWholesale.length > 0 && kpis.bottles > 0;

  if (!hasData) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-10 text-center text-zinc-600 text-sm">
        No HB wholesale data for the selected period.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="HB Wholesale Bottles" value={fmtBottles(kpis.bottles)} />
        <KpiCard label="HB Wholesale Revenue" value={fmtDollar(kpis.revenue)} />
        {locationBreakdown.map(({ loc, bottles, revenue }) => (
          <KpiCard
            key={loc}
            label={`${loc} Wholesale`}
            value={fmtBottles(bottles)}
            sub={fmtDollar(revenue) + ' revenue'}
          />
        ))}
      </div>

      {/* Trend + Product mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly trend by location */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            HB Wholesale Bottles by Location — Monthly
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
              <Tooltip
                content={(props) => (
                  <ChartTip
                    active={props.active}
                    payload={props.payload as []}
                    label={String(props.label)}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: '#71717a', paddingTop: 8 }} />
              {HB_LOCATIONS.map(loc => (
                <Line
                  key={loc}
                  dataKey={loc}
                  name={loc}
                  stroke={LOCATION_COLORS[loc]}
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: LOCATION_COLORS[loc] }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Product mix donut */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4 flex flex-col">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-medium">
            Product Mix (Wholesale Bottles)
          </h3>
          <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 168 }}>
            <ResponsiveContainer width="100%" height={168}>
              <PieChart>
                <Pie
                  data={productMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {productMix.map(e => (
                    <Cell
                      key={e.name}
                      fill={FAMILY_COLORS[e.name] ?? FAMILY_COLOR_DEFAULT}
                      fillOpacity={0.9}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-base font-bold text-white font-serif leading-none">
                {fmtBottles(mixTotal)}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">bottles</span>
            </div>
          </div>
          <div className="space-y-1 mt-1">
            {productMix.slice(0, 5).map(({ name, value }) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: FAMILY_COLORS[name] ?? FAMILY_COLOR_DEFAULT }} />
                <span className="flex-1 truncate text-zinc-400">{name}</span>
                <span className="font-mono text-zinc-300">{value.toLocaleString()}</span>
                <span className="font-mono text-zinc-600 w-9 text-right">
                  {mixTotal > 0 ? ((value / mixTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top products bar chart */}
      {topProducts.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Top Products Ordered by HB Bars (Wholesale Bottles)
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(180, topProducts.length * 34)}>
            <BarChart
              data={[...topProducts].reverse()}
              layout="vertical"
              margin={{ top: 0, right: 56, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={200}
              />
              <Tooltip
                contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              />
              <Bar dataKey="bottles" name="Wholesale Bottles" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {[...topProducts].reverse().map((p) => (
                  <Cell
                    key={p.name}
                    fill={FAMILY_COLORS[p.family] ?? FAMILY_COLOR_DEFAULT}
                    fillOpacity={0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
