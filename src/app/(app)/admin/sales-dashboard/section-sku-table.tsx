'use client';

import { useMemo, useState } from 'react';
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
import type { SkuMonthlyRow } from '@/app/actions/sales-dashboard';
import type { Channel } from './section-revenue';
import { FAMILY_COLORS, FAMILY_COLOR_DEFAULT, GOLD, fmtDollar } from './utils';

// Cycle of distinct chart colors for multi-SKU lines
const LINE_COLORS = [
  '#C5A572', '#3b82f6', '#22c55e', '#ec4899',
  '#8b5cf6', '#06b6d4', '#f97316', '#eab308',
  '#10b981', '#6366f1', '#f43f5e', '#84cc16',
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionSkuTableProps {
  skuMonthly: SkuMonthlyRow[];
  selectedFamilies: string[];
  channel: Channel;
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionSkuTable({
  skuMonthly, selectedFamilies, channel, dateTo,
}: SectionSkuTableProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // ── Build trailing-12-month window from dateTo ─────────────────────────────
  const ttmMonths = useMemo(() => {
    const months: string[] = [];
    const anchor = new Date(dateTo + '-01');
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    return months;
  }, [dateTo]);

  // ── Aggregate SKUs over TTM window ────────────────────────────────────────
  type SkuMeta = {
    brand_code: string;
    product_name: string;
    brand_family: string;
    size: string;
    total: number; // total revenue in window for default ranking
    byMonth: Map<string, number>;
  };

  const skuMap = useMemo(() => {
    const map = new Map<string, SkuMeta>();
    for (const r of skuMonthly) {
      if (!ttmMonths.includes(r.month)) continue;
      if (!inFam(r.brand_family)) continue;
      const revenue =
        channel === 'retail' ? r.retail_amount :
        channel === 'wholesale' ? r.wholesale_amount :
        r.retail_amount + r.wholesale_amount;
      if (!map.has(r.brand_code)) {
        map.set(r.brand_code, {
          brand_code: r.brand_code,
          product_name: r.product_name,
          brand_family: r.brand_family,
          size: r.size,
          total: 0,
          byMonth: new Map(),
        });
      }
      const entry = map.get(r.brand_code)!;
      entry.total += revenue;
      entry.byMonth.set(r.month, (entry.byMonth.get(r.month) ?? 0) + revenue);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuMonthly, selectedFamilies, channel, ttmMonths]);

  // Sorted SKU list for chip selector (by TTM revenue desc)
  const skuList = useMemo(
    () => [...skuMap.values()].filter(s => s.total > 0).sort((a, b) => b.total - a.total),
    [skuMap]
  );

  // Default: top 3 SKUs pre-selected
  const defaultSelected = useMemo(
    () => skuList.slice(0, 3).map(s => s.brand_code),
    // Only recompute when skuList identity changes (i.e. filter/channel changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skuList.map(s => s.brand_code).join(',')]
  );

  // null = "user hasn't touched it yet" → show defaults
  // []  = "user explicitly cleared" → show nothing
  const [activeCodes, setActiveCodes] = useState<string[] | null>(null);

  const selected = activeCodes ?? defaultSelected;

  function toggleSku(code: string) {
    const current = activeCodes ?? defaultSelected;
    setActiveCodes(
      current.includes(code) ? current.filter(c => c !== code) : [...current, code]
    );
  }

  function selectAll() { setActiveCodes(skuList.map(s => s.brand_code)); }
  function clearAll()  { setActiveCodes([]); }

  // ── Build chart data ───────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return ttmMonths.map(m => {
      const row: Record<string, string | number | null> = {
        month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
      for (const code of selected) {
        const meta = skuMap.get(code);
        row[code] = meta?.byMonth.get(m) ?? null;
      }
      return row;
    });
  }, [ttmMonths, selected, skuMap]);

  // Assign a chart color index to each active SKU
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    selected.forEach((code, i) => {
      const meta = skuMap.get(code);
      // If only 1 selected, use gold; otherwise use family color or cycle color
      if (selected.length === 1) {
        map.set(code, GOLD);
      } else {
        map.set(code, FAMILY_COLORS[meta?.brand_family ?? ''] ?? LINE_COLORS[i % LINE_COLORS.length]);
      }
    });
    return map;
  }, [selected, skuMap]);

  // ── Tooltip ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ChartTip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] px-3 py-2 text-xs shadow-xl min-w-[150px]">
        {label && <p className="text-white/60 mb-1.5 font-medium border-b border-zinc-700 pb-1">{label}</p>}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {payload.map((p: any) => {
          if (p.value == null) return null;
          const meta = skuMap.get(p.dataKey as string);
          return (
            <p key={p.dataKey} className="flex justify-between gap-3">
              <span style={{ color: p.color ?? p.fill }} className="truncate max-w-[110px]">
                {meta ? `${meta.brand_code} · ${meta.product_name}` : p.name}
              </span>
              <span className="font-mono font-semibold text-white">{fmtDollar(p.value)}</span>
            </p>
          );
        })}
      </div>
    );
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ['SKU Code', 'Product Name', 'Size', 'Brand Family', ...ttmMonths].join(',');
    const lines = skuList.map(s =>
      [
        s.brand_code,
        `"${s.product_name}"`,
        s.size,
        s.brand_family,
        ...ttmMonths.map(m => (s.byMonth.get(m) ?? 0).toFixed(2)),
      ].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sku-ttm-${dateTo}.csv`;
    a.click();
  }

  const isSingle = selected.length === 1;

  return (
    <div className="rounded-xl border border bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          SKU Revenue — Trailing 12 Months (ending {new Date(dateTo + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
        </h3>
        <button
          onClick={exportCsv}
          className="rounded px-3 py-1 text-xs bg-muted hover:bg-muted text-foreground transition-colors shrink-0"
        >
          Export CSV
        </button>
      </div>

      {/* SKU chip selector — grouped by brand family */}
      <div className="mb-4 space-y-2">
        {/* Controls row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0">SKU</span>
          <button
            onClick={clearAll}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              activeCodes !== null && activeCodes.length === 0
                ? 'bg-primary text-black font-semibold'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}
          >
            All
          </button>
          <button
            onClick={selectAll}
            className="rounded px-2 py-0.5 text-xs bg-muted text-muted-foreground hover:bg-muted transition-colors"
          >
            Select all
          </button>
        </div>
        {/* Family groups */}
        {(() => {
          // Group SKUs by family, preserving revenue-sort order within each family
          const familyOrder: string[] = [];
          const byFamily = new Map<string, typeof skuList>();
          for (const s of skuList) {
            if (!byFamily.has(s.brand_family)) {
              familyOrder.push(s.brand_family);
              byFamily.set(s.brand_family, []);
            }
            byFamily.get(s.brand_family)!.push(s);
          }
          return familyOrder.map((family) => {
            const skus = byFamily.get(family)!;
            const color = FAMILY_COLORS[family] ?? FAMILY_COLOR_DEFAULT;
            return (
              <div key={family} className="flex flex-wrap items-center gap-1.5">
                {/* Family label */}
                <span
                  className="text-[9px] uppercase tracking-widest font-semibold shrink-0 mr-0.5"
                  style={{ color: color + 'aa' }}
                >
                  {family}
                </span>
                {skus.map((s) => {
                  const isActive = selected.includes(s.brand_code);
                  const label = `${s.brand_code} · ${s.product_name}${s.size ? ` (${s.size})` : ''}`;
                  return (
                    <button
                      key={s.brand_code}
                      onClick={() => toggleSku(s.brand_code)}
                      title={label}
                      className="rounded px-2 py-0.5 text-xs transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: isActive ? color + '28' : '#f4f4f5',
                        color: isActive ? color : '#666666',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: isActive ? color + '70' : 'transparent',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          });
        })()}
      </div>

      {/* Chart */}
      {selected.length === 0 || skuList.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Select one or more SKUs above to chart their revenue trend.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#666666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={fmtDollar}
                tick={{ fill: '#666666', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={(props) => (
                <ChartTip active={props.active} payload={props.payload as []} label={String(props.label)} />
              )} />
              {selected.map((code) => {
                const color = colorMap.get(code) ?? GOLD;
                return isSingle ? (
                  <Bar
                    key={code}
                    dataKey={code}
                    name={code}
                    fill={color}
                    fillOpacity={0.85}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    key={code}
                    dataKey={code}
                    name={code}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: color }}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legend / summary row */}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {selected.map((code) => {
              const meta = skuMap.get(code);
              const color = colorMap.get(code) ?? GOLD;
              if (!meta) return null;
              return (
                <div key={code} className="flex items-center gap-2 text-xs">
                  {isSingle ? (
                    <span className="h-2.5 w-2.5 rounded-sm inline-block shrink-0" style={{ background: color }} />
                  ) : (
                    <span className="inline-block w-5 h-0 border-t-2 shrink-0" style={{ borderColor: color }} />
                  )}
                  <span className="text-muted-foreground">
                    <span className="font-mono text-foreground">{code}</span>
                    {' · '}{meta.product_name}
                    {meta.size && <span className="text-muted-foreground"> ({meta.size})</span>}
                  </span>
                  <span className="font-mono text-primary font-semibold">{fmtDollar(meta.total)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
