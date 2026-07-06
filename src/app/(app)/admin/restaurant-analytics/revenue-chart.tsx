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
} from 'recharts';
import { GOLD, fmtMoneyShort, fmtMoney } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface MonthPoint {
  label: string;              // axis label, e.g. "Apr '26"
  cur: number | null;         // current-period revenue
  prior: number | null;       // same month, prior year
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[140px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">
            {p.value != null ? fmtMoney(p.value) : '—'}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function RevenueChart({
  points, curLabel, priorLabel,
}: {
  points: MonthPoint[];
  curLabel: string;   // e.g. "Selected period"
  priorLabel: string; // e.g. "Prior year"
}) {
  const chartData = points.map((p) => ({
    label: p.label,
    [curLabel]: p.cur,
    [priorLabel]: p.prior,
  }));

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          Monthly Revenue — vs Prior Year
        </h3>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />
            {curLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-slate-400" />
            {priorLabel}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#666666', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={8}
          />
          <YAxis
            tickFormatter={(v) => fmtMoneyShort(v as number)}
            tick={{ fill: '#666666', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: 'rgba(197,165,114,0.08)' }}
            content={(props) => (
              <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />
            )}
          />
          <Bar
            dataKey={curLabel}
            name={curLabel}
            fill={GOLD}
            fillOpacity={0.85}
            radius={[3, 3, 0, 0]}
            maxBarSize={34}
            isAnimationActive={false}
          />
          <Line
            dataKey={priorLabel}
            name={priorLabel}
            stroke="#94a3b8"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
