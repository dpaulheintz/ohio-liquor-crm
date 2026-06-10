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
  LabelList,
} from 'recharts';
import type {
  MonthlyRow,
  WholesaleFullRow,
  AccountGroupData,
} from '@/app/actions/sales-dashboard';
import {
  FAMILY_COLORS, FAMILY_COLOR_DEFAULT, GOLD,
  fmtDollar, fmtBottles, eachMonth, fmtMonthLabel,
  isHighBank, resolveAccount,
  KpiCard, ChartTip,
} from './utils';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionWholesaleProps {
  monthly: MonthlyRow[];
  wholesaleFull: WholesaleFullRow[];
  accountGroups: AccountGroupData[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionWholesale({
  monthly, wholesaleFull, accountGroups, selectedFamilies, dateFrom, dateTo,
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
    return eachMonth(dateFrom, dateTo).map(ym => ({
      month: fmtMonthLabel(ym),
      bottles: sums.get(ym) ?? 0,
    }));
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
      .slice(0, 20);
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

    </div>
  );
}
