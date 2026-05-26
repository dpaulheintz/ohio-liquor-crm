'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD        = '#C5A572';
const TARGET_PCT  = 65; // industry prime-cost target (%)
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EMPTY_MONTHS = MONTH_LABELS.map((m) => ({ month: m, labor: null, cogs: null }));

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section04PrimeCostProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#0a0a0a] px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">{label}</span>
      <span className="text-2xl font-serif font-bold text-white leading-none">{value}</span>
      {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Section04PrimeCost(_props: Section04PrimeCostProps) {
  return (
    <div className="space-y-4">
      {/* KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiChip label="Total Labor Cost"   value="—" sub="Period total" />
        <KpiChip label="Labor % of Revenue" value="—" sub={`Target < 30%`} />
        <KpiChip label="Total COGS"          value="—" sub="Food + beverage" />
        <KpiChip label="Prime Cost %"        value="—" sub={`Target ≤ ${TARGET_PCT}%`} />
      </div>

      {/* Stacked bar chart — labor (gold) + COGS (blue), target line */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
            Monthly Labor + COGS as % of Revenue
          </h3>
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: GOLD }} />
              Labor %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm inline-block bg-blue-600" />
              COGS %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed border-red-500/60" />
              {TARGET_PCT}% target
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={EMPTY_MONTHS} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: '#71717a', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={40}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              itemStyle={{ color: '#e4e4e7' }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(v: number) => [`${v.toFixed(1)}%`]}
            />
            <ReferenceLine
              y={TARGET_PCT}
              stroke="#ef4444"
              strokeDasharray="5 3"
              strokeOpacity={0.6}
              label={{ value: `${TARGET_PCT}% target`, position: 'right', fill: '#ef4444', fontSize: 9, opacity: 0.7 }}
            />
            <Bar dataKey="labor" name="Labor %"  stackId="a" fill={GOLD}      fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="cogs"  name="COGS %"   stackId="a" fill="#3b82f6"  fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Line dataKey="__placeholder" stroke="transparent" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
          No data — connect daily_sales to populate
        </p>
      </div>
    </div>
  );
}
