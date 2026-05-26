'use client';

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section03MenuMatrixProps {
  dateFrom: string;
  dateTo: string;
  selectedLocations: string[];
}

// ─── Quadrant labels ──────────────────────────────────────────────────────────

const QUADRANT_LABELS = [
  { x: 75, y: 75, label: '⭐ Stars',       sub: 'High popularity, high margin', color: '#22c55e' },
  { x: 25, y: 75, label: '❓ Puzzles',     sub: 'Low popularity, high margin',  color: '#3b82f6' },
  { x: 75, y: 25, label: '🐂 Plowhorses', sub: 'High popularity, low margin',  color: '#f97316' },
  { x: 25, y: 25, label: '🐕 Dogs',        sub: 'Low popularity, low margin',   color: '#6b7280' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function Section03MenuMatrix(_props: Section03MenuMatrixProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
      <div className="flex items-start gap-4 mb-4 flex-wrap">
        <p className="text-xs text-zinc-500 leading-relaxed max-w-lg">
          Each item is plotted by <span className="text-zinc-300">popularity</span> (x-axis, relative order count)
          vs <span className="text-zinc-300">contribution margin</span> (y-axis, item price − food cost).
          Quadrant boundaries sit at the period median.
        </p>
        {/* Quadrant legend */}
        <div className="flex flex-wrap gap-3 ml-auto">
          {QUADRANT_LABELS.map(({ label, sub, color }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px]">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
              <span style={{ color }} className="font-medium">{label}</span>
              <span className="text-zinc-600 hidden lg:inline">— {sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scatter plot shell */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              type="number"
              dataKey="x"
              name="Popularity"
              domain={[0, 100]}
              tick={{ fill: '#71717a', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Popularity →', position: 'insideBottomRight', offset: -4, fill: '#52525b', fontSize: 9 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Margin"
              domain={[0, 100]}
              tick={{ fill: '#71717a', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={36}
              label={{ value: 'Margin →', angle: -90, position: 'insideLeft', fill: '#52525b', fontSize: 9 }}
            />
            <Tooltip
              contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
              itemStyle={{ color: '#e4e4e7' }}
              cursor={{ strokeDasharray: '3 3', stroke: '#3f3f46' }}
            />
            {/* Midpoint reference lines (median) */}
            <ReferenceLine x={50} stroke="#3f3f46" strokeDasharray="4 4" />
            <ReferenceLine y={50} stroke="#3f3f46" strokeDasharray="4 4" />
            {/* No data — empty scatter */}
            <Scatter name="Menu items" data={[]} fill="#C5A572" fillOpacity={0.8} />
          </ScatterChart>
        </ResponsiveContainer>

        {/* Quadrant corner labels */}
        <div className="absolute top-2 right-8 text-[9px] font-semibold text-emerald-600/70 uppercase tracking-widest pointer-events-none">Stars</div>
        <div className="absolute top-2 left-10 text-[9px] font-semibold text-blue-600/70 uppercase tracking-widest pointer-events-none">Puzzles</div>
        <div className="absolute bottom-8 right-8 text-[9px] font-semibold text-orange-600/70 uppercase tracking-widest pointer-events-none">Plowhorses</div>
        <div className="absolute bottom-8 left-10 text-[9px] font-semibold text-zinc-600/70 uppercase tracking-widest pointer-events-none">Dogs</div>
      </div>

      <p className="mt-2 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
        No data — connect menu_items + daily_item_sales to populate
      </p>
    </div>
  );
}
