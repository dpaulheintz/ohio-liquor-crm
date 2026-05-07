'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export interface RevenueChartPoint {
  month: string;    // "Jan", "Feb", etc.
  current?: number;
  ly?: number;
  twoLY?: number;
}

interface RevenueChartProps {
  data: RevenueChartPoint[];
  currentYear: number;
  loading?: boolean;
}

function fmtDollar(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1a1a1a] p-3 shadow-xl text-sm min-w-[160px]">
      <p className="text-[#C5A572] font-semibold mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex justify-between gap-4 text-xs mb-1">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="text-white font-mono">{fmtDollar(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomLegend({ payload }: any) {
  if (!payload) return null;
  return (
    <div className="flex justify-center gap-6 mt-2">
      {payload.map((p: { value: string; color: string; type: string }) => (
        <div key={p.value} className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span
            className="inline-block rounded-sm"
            style={{
              width: p.type === 'rect' ? 12 : 20,
              height: p.type === 'rect' ? 12 : 2,
              backgroundColor: p.color,
            }}
          />
          {p.value}
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data, currentYear, loading }: RevenueChartProps) {
  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-[#C5A572] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: '#71717a', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => fmtDollar(v)}
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(197,165,114,0.06)' }} />
        <Legend content={<CustomLegend />} />

        {/* Current year: gold bars */}
        <Bar
          dataKey="current"
          name={String(currentYear)}
          fill="#C5A572"
          radius={[3, 3, 0, 0]}
          maxBarSize={40}
        />
        {/* LY: slate line */}
        <Line
          dataKey="ly"
          name={String(currentYear - 1)}
          stroke="#94a3b8"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          connectNulls={false}
        />
        {/* 2LY: dark dashed line */}
        <Line
          dataKey="twoLY"
          name={String(currentYear - 2)}
          stroke="#475569"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
