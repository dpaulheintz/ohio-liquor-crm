'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
} from 'recharts';
import type { MonthlyRow, SplitRow, WholesaleSplitRow } from '@/app/actions/sales-dashboard';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Channel = 'all' | 'retail' | 'wholesale';

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
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function pctVsLY(cur: number, ly: number): { label: string; up: boolean } | null {
  if (!ly) return null;
  const p = ((cur - ly) / ly) * 100;
  return { label: `${p >= 0 ? '+' : ''}${p.toFixed(1)}% vs LY`, up: p >= 0 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, badge,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: { label: string; up: boolean } | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold text-white leading-none">{value}</span>
      {badge && (
        <span className={`text-xs font-mono ${badge.up ? 'text-emerald-400' : 'text-red-400'}`}>
          {badge.label}
        </span>
      )}
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: any[]; label?: string; fmt?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-zinc-400 mb-1.5 font-medium border-b border-zinc-800 pb-1">{label}</p>}
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

export interface SectionRevenueProps {
  monthly: MonthlyRow[];
  splitRows: SplitRow[];
  wholesaleSplit: WholesaleSplitRow[];
  selectedFamilies: string[];
  channel: Channel;
  dateFrom: string;
  dateTo: string;
  currentYear: number;
  maxCurrentYearMonth: string; // '03' → count YTD only through March
  lastUpdated: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionRevenue({
  monthly, splitRows, wholesaleSplit, selectedFamilies, channel, dateFrom, dateTo,
  currentYear, maxCurrentYearMonth, lastUpdated,
}: SectionRevenueProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  const getRevenue = (r: MonthlyRow) =>
    channel === 'retail' ? r.retail_amount
    : channel === 'wholesale' ? r.wholesale_amount
    : r.retail_amount + r.wholesale_amount;

  const getBottles = (r: MonthlyRow) =>
    channel === 'retail' ? r.retail_bottles
    : channel === 'wholesale' ? r.wholesale_bottles
    : r.retail_bottles + r.wholesale_bottles;

  // ── YTD KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const accum = (yr: number) =>
      monthly
        .filter(r => {
          const y = +r.month.slice(0, 4);
          const m = r.month.slice(5, 7);
          return y === yr && m <= maxCurrentYearMonth && inFam(r.brand_family);
        })
        .reduce((a, r) => ({ rev: a.rev + getRevenue(r), bot: a.bot + getBottles(r) }), { rev: 0, bot: 0 });
    const cur = accum(currentYear);
    const ly = accum(currentYear - 1);
    return {
      rev: cur.rev,
      bot: cur.bot,
      revBadge: pctVsLY(cur.rev, ly.rev),
      botBadge: pctVsLY(cur.bot, ly.bot),
      avgPerBtl: cur.bot > 0 ? cur.rev / cur.bot : 0,
      lyAvgPerBtl: ly.bot > 0 ? ly.rev / ly.bot : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, channel, currentYear, maxCurrentYearMonth]);

  // ── Monthly YoY chart ──────────────────────────────────────────────────────
  const yoyData = useMemo(() => {
    const base = monthly.filter(r => inFam(r.brand_family));
    const sums = new Map<string, number>();
    for (const r of base) sums.set(r.month, (sums.get(r.month) ?? 0) + getRevenue(r));
    const y0 = String(currentYear);
    const y1 = String(currentYear - 1);
    const y2 = String(currentYear - 2);
    return MONTH_LABELS.map((lbl, i) => {
      const mm = String(i + 1).padStart(2, '0');
      return {
        month: lbl,
        [y0]: sums.get(`${y0}-${mm}`) ?? null,
        [y1]: sums.get(`${y1}-${mm}`) ?? null,
        [y2]: sums.get(`${y2}-${mm}`) ?? null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, channel, currentYear]);

  // ── Family donut ──────────────────────────────────────────────────────────
  const familyDonut = useMemo(() => {
    const fmap = new Map<string, number>();
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      fmap.set(r.brand_family, (fmap.get(r.brand_family) ?? 0) + getRevenue(r));
    }
    return [...fmap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, channel, dateFrom, dateTo]);
  const donutTotal = familyDonut.reduce((s, r) => s + r.value, 0);

  // ── 12-month rolling trend ─────────────────────────────────────────────────
  const rollingTrend = useMemo(() => {
    const months12: string[] = [];
    const anchor = new Date(dateTo + '-01');
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      months12.push(dt.toISOString().slice(0, 7));
    }
    const base = monthly.filter(r => inFam(r.brand_family));
    const sums = new Map<string, number>();
    for (const r of base) sums.set(r.month, (sums.get(r.month) ?? 0) + getRevenue(r));
    return months12.map(m => ({
      month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      revenue: sums.get(m) ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, channel, dateTo]);

  // ── Split donuts ───────────────────────────────────────────────────────────

  // Donut A: Total Retail vs Wholesale revenue in period
  const channelSplitDonut = useMemo(() => {
    let retail = 0, wholesale = 0;
    for (const r of monthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      retail    += r.retail_amount;
      wholesale += r.wholesale_amount;
    }
    return [
      { name: 'Retail',    value: retail,    color: GOLD },
      { name: 'Wholesale', value: wholesale,  color: '#3b82f6' },
    ].filter(d => d.value > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthly, selectedFamilies, dateFrom, dateTo]);

  // Donut B: Retail — HB agencies vs other retailers
  const retailHbDonut = useMemo(() => {
    let hb = 0, outside = 0;
    for (const r of splitRows) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      if (r.is_hb_agency) hb      += r.retail_amount;
      else                 outside += r.retail_amount;
    }
    return [
      { name: 'HB Locations',   value: hb,      color: GOLD },
      { name: 'Other Retailers', value: outside, color: '#64748b' },
    ].filter(d => d.value > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitRows, selectedFamilies, dateFrom, dateTo]);

  // Donut C: Wholesale — HB bar sales vs external accounts
  const wholesaleHbDonut = useMemo(() => {
    let hb = 0, outside = 0;
    for (const r of wholesaleSplit) {
      if (r.month < dateFrom || r.month > dateTo) continue;
      hb      += r.hb_amount;
      outside += r.outside_amount;
    }
    return [
      { name: 'HB Bar',            value: hb,      color: GOLD },
      { name: 'External Accounts', value: outside,  color: '#22c55e' },
    ].filter(d => d.value > 0);
  }, [wholesaleSplit, dateFrom, dateTo]);

  const y0 = String(currentYear);
  const y1 = String(currentYear - 1);
  const y2 = String(currentYear - 2);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={`YTD ${currentYear} Revenue`}
          value={fmtDollar(kpis.rev)}
          badge={kpis.revBadge}
          sub={`Thru ${new Date(`${currentYear}-${maxCurrentYearMonth}-01`).toLocaleDateString('en-US', { month: 'long' })}`}
        />
        <KpiCard
          label={`YTD ${currentYear} Bottles`}
          value={fmtBottles(kpis.bot)}
          badge={kpis.botBadge}
        />
        <KpiCard
          label="Avg Revenue / Bottle"
          value={kpis.avgPerBtl > 0 ? fmtDollar(kpis.avgPerBtl) : '—'}
          sub={`LY: ${kpis.lyAvgPerBtl > 0 ? fmtDollar(kpis.lyAvgPerBtl) : '—'}`}
        />
        <KpiCard
          label="Data Through"
          value={
            lastUpdated
              ? new Date(lastUpdated + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : '—'
          }
          sub="Most recent month loaded"
        />
      </div>

      {/* YoY bar chart + Family donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* YoY ComposedChart */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
            Monthly Revenue — Year over Year
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={yoyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={fmtDollar}
                tick={{ fill: '#71717a', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
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
              <Bar dataKey={y0} name={y0} fill={GOLD} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={30} />
              <Line
                dataKey={y1}
                name={y1}
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
                connectNulls
              />
              <Line
                dataKey={y2}
                name={y2}
                stroke="#3f3f46"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="2 4"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: GOLD }} />
              {y0}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0 border-t-2 border-dashed border-slate-500" />
              {y1}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-0 border-t-2 border-dashed border-zinc-600" />
              {y2}
            </span>
          </div>
        </div>

        {/* Family donut */}
        <div className="rounded-xl border border-zinc-800 bg-[#111] p-4 flex flex-col">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-medium">
            Revenue by Brand Family
          </h3>
          <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 168 }}>
            <ResponsiveContainer width="100%" height={168}>
              <PieChart>
                <Pie
                  data={familyDonut}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={74}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {familyDonut.map((e) => (
                    <Cell
                      key={e.name}
                      fill={FAMILY_COLORS[e.name] ?? FAMILY_COLOR_DEFAULT}
                      fillOpacity={0.9}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtDollar(v)}
                  contentStyle={{
                    background: '#0f0f0f',
                    border: '1px solid #3f3f46',
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-white font-serif leading-none">
                {fmtDollar(donutTotal)}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">total</span>
            </div>
          </div>
          {/* Legend */}
          <div className="space-y-1 mt-2">
            {familyDonut.slice(0, 6).map(({ name, value }) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: FAMILY_COLORS[name] ?? FAMILY_COLOR_DEFAULT }}
                />
                <span className="flex-1 truncate text-zinc-400">{name}</span>
                <span className="font-mono text-zinc-300">{fmtDollar(value)}</span>
                <span className="font-mono text-zinc-600 w-9 text-right">
                  {donutTotal > 0 ? ((value / donutTotal) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 12-month rolling trend */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          12-Month Rolling Revenue Trend
        </h3>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={rollingTrend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#71717a', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtDollar}
              tick={{ fill: '#71717a', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
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
              name="Revenue"
              stroke={GOLD}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: GOLD }}
              activeDot={{ r: 5, fill: GOLD }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue split donuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: 'Wholesale vs Retail', data: channelSplitDonut },
          { title: 'Retail — HB vs Outside', data: retailHbDonut },
          { title: 'Wholesale — HB Bar vs Outside', data: wholesaleHbDonut },
        ].map(({ title, data }) => {
          const total = data.reduce((s, d) => s + d.value, 0);
          return (
            <div key={title} className="rounded-xl border border-zinc-800 bg-[#111] p-4 flex flex-col">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-medium">
                {title}
              </h3>
              {total === 0 ? (
                <p className="flex-1 flex items-center justify-center text-xs text-zinc-600 py-8">
                  No data for selected range
                </p>
              ) : (
                <>
                  <div className="relative flex items-center justify-center" style={{ height: 148 }}>
                    <ResponsiveContainer width="100%" height={148}>
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={44}
                          outerRadius={66}
                          paddingAngle={2}
                          startAngle={90}
                          endAngle={-270}
                          isAnimationActive={false}
                        >
                          {data.map((d) => (
                            <Cell key={d.name} fill={d.color} fillOpacity={0.88} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => fmtDollar(v)}
                          contentStyle={{
                            background: '#0f0f0f',
                            border: '1px solid #3f3f46',
                            borderRadius: 8,
                            fontSize: 11,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-base font-bold text-white font-serif leading-none">
                        {fmtDollar(total)}
                      </span>
                      <span className="text-[9px] uppercase tracking-widest text-zinc-500 mt-0.5">total</span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-2">
                    {data.map(({ name, value, color }) => (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="flex-1 truncate text-zinc-400">{name}</span>
                        <span className="font-mono text-zinc-300">{fmtDollar(value)}</span>
                        <span className="font-mono text-zinc-600 w-9 text-right">
                          {total > 0 ? ((value / total) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
