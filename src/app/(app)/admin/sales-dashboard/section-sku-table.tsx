'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { SkuMonthlyRow } from '@/app/actions/sales-dashboard';
import type { Channel } from './section-revenue';

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
  Misc: '#a78bfa',
  Unknown: '#6b7280',
};
const FAMILY_COLOR_DEFAULT = '#94a3b8';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ v, i }));
  return (
    <ResponsiveContainer width={80} height={28}>
      <LineChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Tooltip
          formatter={(v: number) => v.toLocaleString()}
          contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 10 }}
          itemStyle={{ color: '#e4e4e7' }}
          labelFormatter={() => ''}
        />
        <Line
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionSkuTableProps {
  skuMonthly: SkuMonthlyRow[];
  selectedFamilies: string[];
  channel: Channel;
  dateFrom: string;
  dateTo: string;
}

type SortKey = 'product_name' | 'brand_family' | 'size' | 'bottles' | 'revenue' | 'pct';
type SortDir = 'asc' | 'desc';

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionSkuTable({
  skuMonthly, selectedFamilies, channel, dateFrom, dateTo,
}: SectionSkuTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [familyFilter, setFamilyFilter] = useState<string>('');

  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // ── Build ordered month list in range ──────────────────────────────────────
  const rangeMonths = useMemo(() => {
    const months: string[] = [];
    const d = new Date(dateFrom + '-01');
    const end = new Date(dateTo + '-01');
    while (d <= end) {
      months.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() + 1);
    }
    return months;
  }, [dateFrom, dateTo]);

  // ── Aggregate by SKU across range ─────────────────────────────────────────
  const rows = useMemo(() => {
    type SkuAgg = {
      brand_code: string;
      product_name: string;
      brand_family: string;
      size: string;
      bottles: number;
      revenue: number;
      monthly: Map<string, number>; // month → bottles|revenue
    };

    const map = new Map<string, SkuAgg>();
    for (const r of skuMonthly) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      const bottles = channel === 'retail' ? r.retail_bottles
        : channel === 'wholesale' ? r.wholesale_bottles
        : r.retail_bottles + r.wholesale_bottles;
      const revenue = channel === 'retail' ? r.retail_amount
        : channel === 'wholesale' ? r.wholesale_amount
        : r.retail_amount + r.wholesale_amount;
      if (!map.has(r.brand_code)) {
        map.set(r.brand_code, {
          brand_code: r.brand_code,
          product_name: r.product_name,
          brand_family: r.brand_family,
          size: r.size,
          bottles: 0,
          revenue: 0,
          monthly: new Map(),
        });
      }
      const entry = map.get(r.brand_code)!;
      entry.bottles += bottles;
      entry.revenue += revenue;
      entry.monthly.set(r.month, (entry.monthly.get(r.month) ?? 0) + revenue);
    }
    return [...map.values()].filter(r => r.bottles > 0 || r.revenue > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuMonthly, selectedFamilies, channel, dateFrom, dateTo]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  // ── Unique families for filter dropdown ───────────────────────────────────
  const families = useMemo(() => {
    const set = new Set(rows.map(r => r.brand_family));
    return [...set].sort();
  }, [rows]);

  // ── Sort + filter ──────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    let filtered = familyFilter ? rows.filter(r => r.brand_family === familyFilter) : rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      if (sortKey === 'product_name') return dir * a.product_name.localeCompare(b.product_name);
      if (sortKey === 'brand_family') return dir * a.brand_family.localeCompare(b.brand_family);
      if (sortKey === 'size')         return dir * a.size.localeCompare(b.size);
      if (sortKey === 'bottles')      return dir * (a.bottles - b.bottles);
      if (sortKey === 'revenue')      return dir * (a.revenue - b.revenue);
      if (sortKey === 'pct')          return dir * (a.revenue - b.revenue); // same order as revenue
      return 0;
    });
    return filtered;
  }, [rows, sortKey, sortDir, familyFilter]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = 'SKU,Brand Family,Size,Bottles,Revenue,% of Total';
    const lines = sorted.map(r =>
      `"${r.product_name}","${r.brand_family}","${r.size}",${r.bottles},${r.revenue.toFixed(2)},${totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : '0'}`
    );
    const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sku-breakdown-${dateFrom}-${dateTo}.csv`;
    a.click();
  }

  const thClass = (key: SortKey) =>
    `px-3 py-2 text-left text-[10px] uppercase tracking-widest font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
      sortKey === key ? 'text-[#C5A572]' : 'text-zinc-500 hover:text-zinc-300'
    }`;
  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111111] p-5">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
          SKU Revenue Breakdown — {rangeMonths.length} month{rangeMonths.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex items-center gap-2">
          {/* Family filter */}
          <select
            value={familyFilter}
            onChange={e => setFamilyFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-[#C5A572]/60"
          >
            <option value="">All families</option>
            {families.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {/* CSV */}
          <button
            onClick={exportCsv}
            className="rounded px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-10 text-center text-zinc-600 text-sm">No SKU data for selected range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className={thClass('product_name')} onClick={() => handleSort('product_name')}>
                  SKU{arrow('product_name')}
                </th>
                <th className={thClass('brand_family')} onClick={() => handleSort('brand_family')}>
                  Family{arrow('brand_family')}
                </th>
                <th className={thClass('size')} onClick={() => handleSort('size')}>
                  Size{arrow('size')}
                </th>
                <th className={thClass('bottles')} onClick={() => handleSort('bottles')}>
                  Bottles{arrow('bottles')}
                </th>
                <th className={thClass('revenue')} onClick={() => handleSort('revenue')}>
                  Revenue{arrow('revenue')}
                </th>
                <th className={thClass('pct')} onClick={() => handleSort('pct')}>
                  % Total{arrow('pct')}
                </th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-zinc-500 font-medium">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {sorted.map((r) => {
                const color = FAMILY_COLORS[r.brand_family] ?? FAMILY_COLOR_DEFAULT;
                const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
                const sparkData = rangeMonths.map(m => r.monthly.get(m) ?? 0);
                return (
                  <tr key={r.brand_code} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-zinc-200">{r.product_name}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium"
                        style={{ color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
                        {r.brand_family}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 tabular-nums">{r.size}</td>
                    <td className="px-3 py-2.5 text-zinc-300 font-mono tabular-nums">
                      {r.bottles.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-200 font-mono tabular-nums font-semibold">
                      {fmtDollar(r.revenue)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(100, pct * 2)}%`, background: color }}
                          />
                        </div>
                        <span className="font-mono text-zinc-500 w-8 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <Sparkline data={sparkData} color={color} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700">
                <td colSpan={3} className="px-3 py-2.5 text-xs text-zinc-500 font-medium">
                  {sorted.length} SKUs
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-300">
                  {sorted.reduce((s, r) => s + r.bottles, 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-200 font-semibold">
                  {fmtDollar(sorted.reduce((s, r) => s + r.revenue, 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
