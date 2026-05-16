'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  LabelList,
} from 'recharts';
import type {
  MonthlyRow,
  WholesaleFullRow,
  SkuMonthlyRow,
  AccountGroupData,
} from '@/app/actions/sales-dashboard';

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

// ─── Account-resolution helpers (same logic as WholesaleLeaderboard) ─────────

function isHighBank(wholesaler: string | null, dba: string | null): boolean {
  const w = (wholesaler ?? '').toUpperCase();
  const d = (dba ?? '').toUpperCase();
  return w.includes('HIGH BANK') || d.includes('HIGH BANK');
}

function resolveAccount(
  wholesaler: string | null,
  dba: string | null,
  groups: AccountGroupData[]
): { key: string; displayName: string; groupColor?: string } {
  const wl = (wholesaler ?? '').toLowerCase();
  const dl = (dba ?? '').toLowerCase();

  for (const group of groups) {
    const hit = (text: string) =>
      group.match_terms.some((term) => text.includes(term.toLowerCase()));
    const matched =
      group.match_columns === 'wholesaler' ? hit(wl) :
      group.match_columns === 'dba'        ? hit(dl) :
      hit(wl) || hit(dl);
    if (matched) {
      return { key: `group::${group.id}`, displayName: group.group_name, groupColor: group.color };
    }
  }
  const name = wholesaler?.trim() || dba?.trim() || 'Unknown Account';
  return { key: `raw::${name}`, displayName: name };
}

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

export interface SectionWholesaleProps {
  monthly: MonthlyRow[];
  skuMonthly: SkuMonthlyRow[];
  wholesaleFull: WholesaleFullRow[];
  accountGroups: AccountGroupData[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionWholesale({
  monthly, skuMonthly, wholesaleFull, accountGroups, selectedFamilies, dateFrom, dateTo,
}: SectionWholesaleProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let bottles = 0, revenue = 0;
    const accounts = new Set<string>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      bottles += r.wholesale_bottles;
      revenue += r.wholesale_amount;
    }
    for (const r of wholesaleFull) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      accounts.add(r.agency_id);
    }
    return { bottles, revenue, accountCount: accounts.size };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, wholesaleFull, selectedFamilies, dateFrom, dateTo]);

  // ── Monthly wholesale bars ─────────────────────────────────────────────────
  const monthlyBars = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      sums.set(r.month, (sums.get(r.month) ?? 0) + r.wholesale_bottles);
    }
    const result: { month: string; bottles: number }[] = [];
    const d = new Date(dateFrom + '-01');
    const end = new Date(dateTo + '-01');
    while (d <= end) {
      const key = d.toISOString().slice(0, 7);
      result.push({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        bottles: sums.get(key) ?? 0,
      });
      d.setMonth(d.getMonth() + 1);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, dateFrom, dateTo]);

  // ── Top 20 accounts — grouped by wholesaler/DBA, sorted by revenue ──────────
  const topAccounts = useMemo(() => {
    type Acc = { displayName: string; bottles: number; revenue: number; color?: string };
    const amap = new Map<string, Acc>();

    for (const r of wholesaleFull) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      if (isHighBank(r.wholesaler_name, r.dba)) continue; // exclude HB

      const resolved = resolveAccount(r.wholesaler_name, r.dba, accountGroups);
      const existing = amap.get(resolved.key) ?? {
        displayName: resolved.displayName,
        bottles: 0,
        revenue: 0,
        color: resolved.groupColor,
      };
      existing.bottles += r.bottles_sold;
      existing.revenue += r.amount;
      amap.set(resolved.key, existing);
    }

    return [...amap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)
      .reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholesaleFull, accountGroups, selectedFamilies, dateFrom, dateTo]);

  // ── Bottles by family pie ──────────────────────────────────────────────────
  const familyPie = useMemo(() => {
    const fmap = new Map<string, number>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      fmap.set(r.brand_family, (fmap.get(r.brand_family) ?? 0) + r.wholesale_bottles);
    }
    return [...fmap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, dateFrom, dateTo]);
  const pieTotalBtl = familyPie.reduce((s, r) => s + r.value, 0);

  // ── SKU bubble chart ───────────────────────────────────────────────────────
  const skuBubbles = useMemo(() => {
    const smap = new Map<string, { name: string; bottles: number; revenue: number; family: string }>();
    for (const r of skuMonthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      const e = smap.get(r.brand_code) ?? { name: r.product_name, bottles: 0, revenue: 0, family: r.brand_family };
      e.bottles += r.wholesale_bottles;
      e.revenue += r.wholesale_amount;
      smap.set(r.brand_code, e);
    }
    return [...smap.values()]
      .filter(s => s.bottles > 0)
      .sort((a, b) => b.bottles - a.bottles)
      .slice(0, 40)
      .map(s => ({ ...s, z: Math.sqrt(s.revenue) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuMonthly, selectedFamilies, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Wholesale Bottles Sold" value={fmtBottles(kpis.bottles)} />
        <KpiCard label="Wholesale Revenue" value={fmtDollar(kpis.revenue)} />
        <KpiCard label="Active Accounts" value={kpis.accountCount.toString()} sub="Unique buyers in period" />
      </div>

      {/* Monthly bars + Family pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Monthly Wholesale Bottles Sold
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyBars} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={42} />
              <Tooltip
                content={(props) => (
                  <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />
                )}
              />
              <Bar dataKey="bottles" name="Bottles" fill="#3b82f6" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Family pie */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4 flex flex-col">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-medium">
            Bottles by Family
          </h3>
          <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 160 }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={familyPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={46} outerRadius={68} paddingAngle={2} startAngle={90} endAngle={-270}>
                  {familyPie.map(e => (
                    <Cell key={e.name} fill={FAMILY_COLORS[e.name] ?? FAMILY_COLOR_DEFAULT} fillOpacity={0.9} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                  itemStyle={{ color: '#e4e4e7' }}
                  labelStyle={{ color: '#71717a' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-base font-bold text-white font-serif leading-none">{fmtBottles(pieTotalBtl)}</span>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">bottles</span>
            </div>
          </div>
          <div className="space-y-1 mt-2">
            {familyPie.slice(0, 5).map(({ name, value }) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: FAMILY_COLORS[name] ?? FAMILY_COLOR_DEFAULT }} />
                <span className="flex-1 truncate text-zinc-400">{name}</span>
                <span className="font-mono text-zinc-300">{value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 20 accounts — grouped by actual buyer, ranked by revenue */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Top 20 Wholesale Accounts by Revenue
        </h3>
        {topAccounts.length === 0 ? (
          <p className="py-8 text-center text-zinc-600 text-sm">No data for selected range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, topAccounts.length * 32)}>
            <BarChart data={topAccounts} layout="vertical" margin={{ top: 0, right: 80, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={fmtDollar}
                tick={{ fill: '#71717a', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="displayName"
                type="category"
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={200}
                tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 27) + '…' : v}
              />
              <Tooltip
                contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: '#e4e4e7' }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: number) => [fmtDollar(v), 'Revenue']}
              />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {topAccounts.map((acc, i) => (
                  <Cell key={i} fill={acc.color ?? GOLD} fillOpacity={0.82} />
                ))}
                <LabelList
                  dataKey="revenue"
                  position="right"
                  style={{ fill: '#a1a1aa', fontSize: 10 }}
                  formatter={(v: number) => fmtDollar(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* SKU bubble scatter chart */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Wholesale by SKU — Bottles vs Revenue (bubble size = revenue)
        </h3>
        {skuBubbles.length === 0 ? (
          <p className="py-8 text-center text-zinc-600 text-sm">No SKU data for selected range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="bottles" name="Bottles"
                tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false}
                label={{ value: 'Bottles Sold', position: 'insideBottom', offset: -12, fill: '#52525b', fontSize: 9 }}
              />
              <YAxis
                dataKey="revenue" name="Revenue"
                tickFormatter={fmtDollar}
                tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={52}
              />
              <ZAxis dataKey="z" range={[24, 600]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: '#3f3f46' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const d = (payload[0] as any)?.payload;
                  return (
                    <div className="rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-xs shadow-xl max-w-[220px]">
                      <p className="text-white font-medium mb-1 leading-snug">{d?.name}</p>
                      <p className="text-zinc-400">Bottles: <span className="text-white font-mono">{(d?.bottles ?? 0).toLocaleString()}</span></p>
                      <p className="text-zinc-400">Revenue: <span className="text-white font-mono">{fmtDollar(d?.revenue ?? 0)}</span></p>
                      <p className="text-zinc-600 text-[10px] mt-0.5">{d?.family}</p>
                    </div>
                  );
                }}
              />
              <Scatter data={skuBubbles} fill={GOLD} fillOpacity={0.55} />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
