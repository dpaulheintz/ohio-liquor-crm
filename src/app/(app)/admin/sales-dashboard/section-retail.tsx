'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  LabelList,
} from 'recharts';
import type { MonthlyRow, SkuMonthlyRow, AgencySkuRow } from '@/app/actions/sales-dashboard';

// ─── Constants ────────────────────────────────────────────────────────────────

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
const GOLD = '#C5A572';

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

export interface SectionRetailProps {
  monthly: MonthlyRow[];
  skuMonthly: SkuMonthlyRow[];
  agencySkuMonthly: AgencySkuRow[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionRetail({
  monthly, skuMonthly, agencySkuMonthly, selectedFamilies, dateFrom, dateTo,
}: SectionRetailProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);
  const [selectedSkuCode, setSelectedSkuCode] = useState<string>('');

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let retailRev = 0, retailBot = 0, totalRev = 0;
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      retailRev += r.retail_amount;
      retailBot += r.retail_bottles;
      totalRev += r.retail_amount + r.wholesale_amount;
    }
    const pct = totalRev > 0 ? (retailRev / totalRev) * 100 : 0;
    return { retailRev, retailBot, pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, dateFrom, dateTo]);

  // ── Monthly retail trend ───────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      sums.set(r.month, (sums.get(r.month) ?? 0) + r.retail_amount);
    }
    const result: { month: string; revenue: number }[] = [];
    const d = new Date(dateFrom + '-01');
    const end = new Date(dateTo + '-01');
    while (d <= end) {
      const key = d.toISOString().slice(0, 7);
      result.push({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: sums.get(key) ?? 0,
      });
      d.setMonth(d.getMonth() + 1);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, dateFrom, dateTo]);

  // ── Retail by family stacked bar ───────────────────────────────────────────
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const r of monthly) {
      if (!inFam(r.brand_family)) continue;
      set.add(r.brand_family);
    }
    return [...set];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies]);

  const stackedData = useMemo(() => {
    // Build map: month → { family → retail_bottles }
    const mmap = new Map<string, Record<string, number>>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      const entry = mmap.get(r.month) ?? {};
      entry[r.brand_family] = (entry[r.brand_family] ?? 0) + r.retail_bottles;
      mmap.set(r.month, entry);
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
      for (const f of families) row[f] = data[f] ?? 0;
      result.push(row);
      d.setMonth(d.getMonth() + 1);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, families, dateFrom, dateTo]);

  // ── Top 15 SKUs by retail bottles ──────────────────────────────────────────
  const topSkus = useMemo(() => {
    const smap = new Map<string, { name: string; bottles: number; family: string }>();
    for (const r of skuMonthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      const e = smap.get(r.brand_code) ?? {
        name: r.product_name,
        bottles: 0,
        family: r.brand_family,
      };
      e.bottles += r.retail_bottles;
      smap.set(r.brand_code, e);
    }
    return [...smap.values()]
      .filter(s => s.bottles > 0)
      .sort((a, b) => b.bottles - a.bottles)
      .slice(0, 15)
      .reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuMonthly, selectedFamilies, dateFrom, dateTo]);

  // ── SKU options for agency ranking dropdown ────────────────────────────────
  const skuOptions = useMemo(() => {
    const smap = new Map<string, { code: string; name: string; family: string }>();
    for (const r of agencySkuMonthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      if (!smap.has(r.brand_code)) {
        smap.set(r.brand_code, { code: r.brand_code, name: r.product_name, family: r.brand_family });
      }
    }
    return [...smap.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencySkuMonthly, selectedFamilies, dateFrom, dateTo]);

  // ── Top 10 agencies for selected SKU ──────────────────────────────────────
  const topAgencies = useMemo(() => {
    if (!selectedSkuCode) return [];
    const amap = new Map<string, { agency_id: string; agency_name: string | null; bottles: number; revenue: number }>();
    for (const r of agencySkuMonthly) {
      if (r.brand_code !== selectedSkuCode) continue;
      if (r.month < dateFrom || r.month > dateTo) continue;
      if (!amap.has(r.agency_id)) {
        amap.set(r.agency_id, { agency_id: r.agency_id, agency_name: r.agency_name, bottles: 0, revenue: 0 });
      }
      const e = amap.get(r.agency_id)!;
      e.bottles += r.retail_bottles;
      e.revenue += r.retail_amount;
    }
    return [...amap.values()]
      .filter(a => a.bottles > 0)
      .sort((a, b) => b.bottles - a.bottles)
      .slice(0, 10);
  }, [agencySkuMonthly, selectedSkuCode, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Retail Revenue" value={fmtDollar(kpis.retailRev)} />
        <KpiCard label="Retail Bottles Sold" value={fmtBottles(kpis.retailBot)} />
        <KpiCard
          label="Retail Share of Revenue"
          value={`${kpis.pct.toFixed(1)}%`}
          sub="vs wholesale in same period"
        />
      </div>

      {/* Trend + Stacked bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly retail trend */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Retail Revenue by Month
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtDollar} tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                content={(props) => (
                  <ChartTip
                    active={props.active}
                    payload={props.payload as []}
                    label={String(props.label)}
                    fmt={fmtDollar}
                  />
                )}
              />
              <Line
                dataKey="revenue"
                name="Retail Revenue"
                stroke={GOLD}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: GOLD }}
                activeDot={{ r: 5, fill: GOLD }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Stacked bar by family */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Retail Bottles by Brand Family
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stackedData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
              <Tooltip
                contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              />
              {families.map((f) => (
                <Bar
                  key={f}
                  dataKey={f}
                  stackId="a"
                  fill={FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT}
                  fillOpacity={0.85}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2">
            {families.map(f => (
              <span key={f} className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span className="h-2 w-2 rounded-sm" style={{ background: FAMILY_COLORS[f] ?? FAMILY_COLOR_DEFAULT }} />
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Top products horizontal bar */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Top Products by Retail Bottles
        </h3>
        {topSkus.length === 0 ? (
          <p className="py-8 text-center text-zinc-600 text-sm">No retail data for selected range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, topSkus.length * 32)}>
            <BarChart
              data={topSkus}
              layout="vertical"
              margin={{ top: 0, right: 64, bottom: 0, left: 8 }}
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
              <Bar
                dataKey="bottles"
                name="Retail Bottles"
                radius={[0, 3, 3, 0]}
                isAnimationActive={false}
              >
                {topSkus.map((s) => (
                  <Cell
                    key={s.name}
                    fill={FAMILY_COLORS[s.family] ?? FAMILY_COLOR_DEFAULT}
                    fillOpacity={0.8}
                  />
                ))}
                <LabelList
                  dataKey="bottles"
                  position="right"
                  style={{ fill: '#a1a1aa', fontSize: 10 }}
                  formatter={(v: number) => v.toLocaleString()}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Agency ranking by SKU */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
            Top 10 Agencies by SKU
          </h3>
          <select
            value={selectedSkuCode}
            onChange={e => setSelectedSkuCode(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-[#C5A572]/60 max-w-xs"
          >
            <option value="">— Select a SKU —</option>
            {skuOptions.map(s => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
        </div>

        {!selectedSkuCode ? (
          <p className="py-8 text-center text-zinc-600 text-sm">
            Select a SKU above to see which retail agencies sold the most bottles.
          </p>
        ) : topAgencies.length === 0 ? (
          <p className="py-8 text-center text-zinc-600 text-sm">No agency data for this SKU in the selected range.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Horizontal bar chart */}
            <ResponsiveContainer width="100%" height={Math.max(160, topAgencies.length * 36)}>
              <BarChart
                data={[...topAgencies].reverse()}
                layout="vertical"
                margin={{ top: 0, right: 56, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="agency_name"
                  type="category"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={180}
                  tickFormatter={(v: string | null) => v ? (v.length > 22 ? v.slice(0, 21) + '…' : v) : 'Unknown'}
                />
                <Tooltip
                  contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="bottles" name="Retail Bottles" fill={GOLD} fillOpacity={0.8} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="bottles"
                    position="right"
                    style={{ fill: '#a1a1aa', fontSize: 10 }}
                    formatter={(v: number) => v.toLocaleString()}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-widest text-zinc-500 font-medium">#</th>
                    <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Agency</th>
                    <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-widest text-zinc-500 font-medium">ID</th>
                    <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Bottles</th>
                    <th className="px-2 py-1.5 text-right text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {topAgencies.map((a, i) => (
                    <tr key={a.agency_id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="px-2 py-2 text-zinc-600 font-mono">{i + 1}</td>
                      <td className="px-2 py-2 text-zinc-300 font-medium truncate max-w-[160px]">
                        {a.agency_name ?? 'Unknown'}
                      </td>
                      <td className="px-2 py-2 text-zinc-600 font-mono">{a.agency_id}</td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-300">{a.bottles.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-200">
                        {a.revenue >= 1000 ? `$${(a.revenue / 1000).toFixed(1)}k` : `$${a.revenue.toFixed(0)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
