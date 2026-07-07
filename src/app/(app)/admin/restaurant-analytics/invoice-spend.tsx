'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { GOLD, fmtMoney, fmtMoneyShort } from './lib';

// ─── Data contract ────────────────────────────────────────────────────────────

export interface InvoiceSpendData {
  monthly: Array<{ label: string; food: number; bev: number; other: number; total: number }>;
  ytd: { food: number; bev: number; other: number; total: number };
}

const FOOD_COLOR = GOLD;
const BEV_COLOR = '#7c9cb5';
const OTHER_COLOR = '#cbb89a';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SpendTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: { value?: number }) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[150px]">
      {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <p key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color ?? p.fill }} className="truncate">{p.name}</span>
          <span className="font-mono font-semibold text-white">{fmtMoney(p.value ?? 0)}</span>
        </p>
      ))}
      <p className="flex justify-between gap-3 border-t border-zinc-700 mt-1 pt-1">
        <span className="text-white/60">Total</span>
        <span className="font-mono font-semibold text-white">{fmtMoney(total)}</span>
      </p>
    </div>
  );
}

function YtdStat({ label, value, share, color }: { label: string; value: number; share: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />{label}
      </span>
      <span className="font-serif text-xl font-bold text-foreground leading-none">{fmtMoney(value)}</span>
      <span className="text-xs text-muted-foreground">{share.toFixed(0)}% of spend</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function InvoiceSpend({ data }: { data: InvoiceSpendData }) {
  const t = data.ytd.total || 1;

  return (
    <div className="space-y-4">
      {/* YTD stat row */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Invoice Spend — Selected Period</h3>
          <span className="text-[10px] text-muted-foreground">food/bev split approximated by vendor</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <YtdStat label="Total" value={data.ytd.total} share={100} color="#a1a1aa" />
          <YtdStat label="Food" value={data.ytd.food} share={(data.ytd.food / t) * 100} color={FOOD_COLOR} />
          <YtdStat label="Beverage" value={data.ytd.bev} share={(data.ytd.bev / t) * 100} color={BEV_COLOR} />
          <YtdStat label="Unclassified" value={data.ytd.other} share={(data.ytd.other / t) * 100} color={OTHER_COLOR} />
        </div>
      </div>

      {/* Monthly stacked bars */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-3">Monthly Invoice Spend</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.monthly} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={(v) => fmtMoneyShort(v as number)} tick={{ fill: '#666', fontSize: 9 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip cursor={{ fill: 'rgba(197,165,114,0.08)' }} content={(p) => <SpendTip active={p.active} payload={p.payload as []} label={String(p.label)} />} />
            <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" iconSize={8} />
            <Bar dataKey="food" name="Food" stackId="s" fill={FOOD_COLOR} isAnimationActive={false} maxBarSize={34} />
            <Bar dataKey="bev" name="Beverage" stackId="s" fill={BEV_COLOR} isAnimationActive={false} maxBarSize={34} />
            <Bar dataKey="other" name="Unclassified" stackId="s" fill={OTHER_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={34} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
