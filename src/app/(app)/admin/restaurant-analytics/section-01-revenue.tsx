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

// ─── Data contract ────────────────────────────────────────────────────────────

export interface MonthlyRevenuePoint {
  month: string;
  cur: number | null;
  prior: number | null;
}

export interface Section01Data {
  ytdFnbRevenue: number;
  priorYtdFnbRevenue: number;
  laborPct: number | null;
  guestCount: number;
  avgCheck: number;
  dataThrough: string | null;
  monthlyRevenue: MonthlyRevenuePoint[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function yoyBadge(cur: number, prior: number): { label: string; up: boolean } | null {
  if (!prior) return null;
  const delta = ((cur - prior) / prior) * 100;
  const sign = delta >= 0 ? '+' : '';
  return { label: `${sign}${delta.toFixed(1)}% vs prior year`, up: delta >= 0 };
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
    <div className="rounded-xl border bg-card px-5 py-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">{label}</span>
      <span className="text-3xl font-serif font-bold text-foreground leading-none">{value}</span>
      {badge && (
        <span className={`text-xs font-mono ${badge.up ? 'text-emerald-400' : 'text-red-400'}`}>
          {badge.label}
        </span>
      )}
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[130px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function Section01Revenue({ data }: { data: Section01Data }) {
  const currentYear = new Date().getFullYear();
  const priorYear   = currentYear - 1;

  const badge = data.ytdFnbRevenue > 0
    ? yoyBadge(data.ytdFnbRevenue, data.priorYtdFnbRevenue)
    : null;

  const chartData = data.monthlyRevenue.map((pt) => ({
    month: pt.month,
    [currentYear]: pt.cur,
    [priorYear]: pt.prior,
  }));

  const dataThroughLabel = data.dataThrough
    ? new Date(data.dataThrough + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="YTD F&B Revenue"
          value={data.ytdFnbRevenue > 0 ? fmtDollar(data.ytdFnbRevenue) : '—'}
          badge={badge}
          sub={`${currentYear} year-to-date`}
        />
        <KpiCard
          label="YTD Retail Revenue"
          value="—"
          sub="Retail POS not yet connected"
        />
        <KpiCard
          label="Labor % of Sales"
          value={data.laborPct != null ? fmtPct(data.laborPct) : '—'}
          sub="Blended, all locations"
        />
        <KpiCard
          label="Guest Count"
          value={data.guestCount > 0 ? data.guestCount.toLocaleString() : '—'}
          sub={`YTD ${currentYear}`}
        />
        <KpiCard
          label="Avg Check"
          value={data.avgCheck > 0 ? fmtDollar(data.avgCheck) : '—'}
          sub={dataThroughLabel ? `Through ${dataThroughLabel}` : 'No data loaded'}
        />
      </div>

      {/* Year-over-year chart */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Monthly F&amp;B Revenue — Year over Year
          </h3>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GOLD }} />
              {currentYear}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed border-muted-foreground" />
              {priorYear}
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#666666', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtDollar(v as number)}
              tick={{ fill: '#666666', fontSize: 9 }}
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

        {dataThroughLabel && (
          <p className="mt-2 text-right text-[10px] text-muted-foreground font-mono">
            data through {dataThroughLabel}
          </p>
        )}
      </div>
    </div>
  );
}
