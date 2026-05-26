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

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Placeholder 12-month scaffold — all zeros until data is wired
const EMPTY_YOY = MONTH_LABELS.map((month) => ({
  month,
  [new Date().getFullYear()]: null,
  [new Date().getFullYear() - 1]: null,
}));

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
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
function ChartTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-zinc-400 mb-1.5 font-medium border-b border-zinc-800 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">
            {p.value != null ? fmtDollar(p.value) : '—'}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Section01RevenueProps {
  dataThrough: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Section01Revenue({ dataThrough }: Section01RevenueProps) {
  const currentYear = new Date().getFullYear();
  const priorYear   = currentYear - 1;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label={`YTD F&B Revenue`}
          value="—"
          sub={`${currentYear} year-to-date`}
        />
        <KpiCard
          label="YTD Retail Revenue"
          value="—"
          sub={`${currentYear} year-to-date`}
        />
        <KpiCard
          label="Labor % of Sales"
          value="—"
          sub="Blended, all locations"
        />
        <KpiCard
          label="Guest Count"
          value="—"
          sub={`YTD ${currentYear}`}
        />
        <KpiCard
          label="Avg Check"
          value="—"
          sub={
            dataThrough
              ? `Data through ${new Date(dataThrough + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'No data loaded'
          }
        />
      </div>

      {/* Year-over-year chart */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
            Monthly F&amp;B Revenue — Year over Year
          </h3>
          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />
              {currentYear}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed border-zinc-500" />
              {priorYear}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center h-[220px] rounded-lg border border-dashed border-zinc-800 text-zinc-600 text-xs">
          {/* Placeholder — chart renders once daily_sales data is wired */}
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={EMPTY_YOY} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#71717a', fontSize: 10 }}
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
                  <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />
                )}
              />
              <Bar
                dataKey={String(currentYear)}
                name={String(currentYear)}
                fill={GOLD}
                fillOpacity={0.85}
                radius={[3, 3, 0, 0]}
                maxBarSize={30}
                isAnimationActive={false}
              />
              <Line
                dataKey={String(priorYear)}
                name={String(priorYear)}
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-center text-[10px] text-zinc-700 uppercase tracking-widest">
          No data — connect Toast / MarginEdge sync to populate
        </p>
      </div>
    </div>
  );
}
