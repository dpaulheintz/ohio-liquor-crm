'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';

export interface TrendSeries {
  key: string;       // unique key
  name: string;      // display name
  family: string;
  color: string;
  sparkData: number[];  // just bottles per month for sparkline
  data: Array<{ month: string; bottles: number | null; revenue: number | null }>;
  totalBottles: number;
  visible: boolean;
}

interface TrendChartProps {
  series: TrendSeries[];
  months: string[];
  level: 'family' | 'product';
  onLevelChange: (l: 'family' | 'product') => void;
  onToggle: (key: string) => void;
}

// Lightweight SVG sparkline
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="w-14 inline-block" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 56, H = 18;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1a1a1a] p-3 shadow-xl text-sm max-w-[220px]">
      <p className="text-[#C5A572] font-semibold text-xs mb-2">
        {(() => {
          const d = new Date(label + '-01');
          return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        })()}
      </p>
      {payload.map((p: { name: string; value: number | null; color: string; payload: { revenue?: number } }) => (
        p.value != null && (
          <div key={p.name} className="mb-1">
            <div className="flex justify-between gap-3 text-xs">
              <span style={{ color: p.color }} className="font-medium truncate">{p.name}</span>
              <span className="text-white font-mono">{p.value.toLocaleString()} btl</span>
            </div>
          </div>
        )
      ))}
    </div>
  );
}

function fmtAxisMonth(m: string) {
  const d = new Date(m + '-01');
  return d.toLocaleDateString('en-US', { month: 'short' }).slice(0, 3);
}

export function TrendChart({ series, months, level, onLevelChange, onToggle }: TrendChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const visible = series.filter((s) => s.visible);
  const chartData = months.map((m) => {
    const point: Record<string, string | number | null> = { month: m };
    for (const s of visible) {
      const d = s.data.find((r) => r.month === m);
      point[s.key] = d?.bottles ?? null;
    }
    return point;
  });

  return (
    <div className="space-y-4">
      {/* Level toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">View:</span>
        {(['family', 'product'] as const).map((l) => (
          <button
            key={l}
            onClick={() => onLevelChange(l)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              level === l
                ? 'bg-[#C5A572] text-black'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {l === 'family' ? 'Brand Family' : 'Product'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtAxisMonth}
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(months.length / 10)}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#333' }} />
          {visible.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={hovered === null || hovered === s.key ? 2 : 0.5}
              strokeOpacity={hovered === null || hovered === s.key ? 1 : 0.3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend with sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {series
          .slice()
          .sort((a, b) => b.totalBottles - a.totalBottles)
          .map((s) => (
            <button
              key={s.key}
              onClick={() => onToggle(s.key)}
              onMouseEnter={() => setHovered(s.key)}
              onMouseLeave={() => setHovered(null)}
              className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-all ${
                s.visible
                  ? 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                  : 'border-zinc-800 bg-zinc-950 opacity-40'
              }`}
            >
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs text-zinc-300 flex-1 truncate leading-tight">{s.name}</span>
              <Sparkline data={s.sparkData} color={s.color} />
            </button>
          ))}
      </div>
    </div>
  );
}
