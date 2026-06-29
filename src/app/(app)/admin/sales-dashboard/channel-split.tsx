'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import type { SplitRow } from '@/app/actions/sales-dashboard';
import { X, ChevronRight } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const RETAIL_COLOR = '#C5A572'; // gold
const WHOLESALE_COLOR = '#475569'; // slate-600

const HB_COLORS: Record<string, string> = {
  Grandview: '#C5A572',
  Gahanna: '#f97316',
  Westerville: '#22c55e',
  External: '#475569',
};

// ─── Chart data types ─────────────────────────────────────────────────────────

interface FamilyPoint {
  family: string;
  retail_btl: number;
  wholesale_btl: number;
  total_btl: number;
  retail_pct: number;
  wholesale_pct: number;
  hb_wholesale_btl: number; // for "badge distinctly" footnote in tooltip
}

interface ProductPoint {
  product: string;
  retail_btl: number;
  wholesale_btl: number;
  total_btl: number;
  retail_pct: number;
  wholesale_pct: number;
}

interface HbSlice {
  name: string;
  value: number;
  color: string;
}

interface HbStats {
  totalRetail: number;
  hbRetailTotal: number;
  externalRetail: number;
  hbWholesale: number;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtBtl(n: number) {
  return n.toLocaleString();
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SplitTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload as FamilyPoint | ProductPoint;
  if (!pt) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-[#1C1C1C] p-3 shadow-xl text-xs min-w-[210px]">
      <p className="font-semibold text-white mb-2.5 leading-tight">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-6">
          <span style={{ color: RETAIL_COLOR }}>Retail</span>
          <span className="font-mono text-white/90">
            {fmtBtl(pt.retail_btl)} btl{' '}
            <span className="text-white/50">({Math.round(pt.retail_pct)}%)</span>
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: '#94a3b8' }}>Wholesale</span>
          <span className="font-mono text-white/90">
            {fmtBtl(pt.wholesale_btl)} btl{' '}
            <span className="text-white/50">({Math.round(pt.wholesale_pct)}%)</span>
          </span>
        </div>
        {'hb_wholesale_btl' in pt && (pt as FamilyPoint).hb_wholesale_btl > 0 && (
          <div className="flex justify-between gap-6 pt-1.5 border-t border-zinc-700">
            <span className="text-white/50">HB Wholesale</span>
            <span className="font-mono text-primary/70">
              {fmtBtl((pt as FamilyPoint).hb_wholesale_btl)} btl
            </span>
          </div>
        )}
        <div className="flex justify-between gap-6 pt-1.5 border-t border-zinc-700">
          <span className="text-white/50">Total</span>
          <span className="font-mono text-white font-medium">{fmtBtl(pt.total_btl)} btl</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ChannelSplitProps {
  splitRows: SplitRow[];
  dateFrom: string;
  dateTo: string;
  selectedFamilies: string[];
}

export function ChannelSplit({
  splitRows,
  dateFrom,
  dateTo,
  selectedFamilies,
}: ChannelSplitProps) {
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  // ── Filter rows by date + family ────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      splitRows.filter(
        (r) =>
          r.month >= dateFrom &&
          r.month <= dateTo &&
          (selectedFamilies.length === 0 || selectedFamilies.includes(r.brand_family))
      ),
    [splitRows, dateFrom, dateTo, selectedFamilies]
  );

  // ── Family-level split ─────────────────────────────────────────────────────
  const familyData = useMemo<FamilyPoint[]>(() => {
    const map = new Map<
      string,
      { retail: number; wholesale: number; hbWholesale: number }
    >();
    for (const r of filtered) {
      if (!map.has(r.brand_family)) {
        map.set(r.brand_family, { retail: 0, wholesale: 0, hbWholesale: 0 });
      }
      const acc = map.get(r.brand_family)!;
      acc.retail += r.retail_bottles;
      acc.wholesale += r.wholesale_bottles;
      if (r.is_hb_agency) acc.hbWholesale += r.wholesale_bottles;
    }

    return Array.from(map.entries())
      .map(([family, v]) => {
        const total = v.retail + v.wholesale;
        return {
          family,
          retail_btl: v.retail,
          wholesale_btl: v.wholesale,
          total_btl: total,
          retail_pct: total > 0 ? (v.retail / total) * 100 : 0,
          wholesale_pct: total > 0 ? (v.wholesale / total) * 100 : 0,
          hb_wholesale_btl: v.hbWholesale,
        };
      })
      .sort((a, b) => b.total_btl - a.total_btl);
  }, [filtered]);

  // ── Product-level split (drill-down) ───────────────────────────────────────
  const productData = useMemo<ProductPoint[]>(() => {
    if (!selectedFamily) return [];
    const map = new Map<string, { retail: number; wholesale: number }>();
    for (const r of filtered) {
      if (r.brand_family !== selectedFamily) continue;
      if (!map.has(r.product_name)) map.set(r.product_name, { retail: 0, wholesale: 0 });
      const acc = map.get(r.product_name)!;
      acc.retail += r.retail_bottles;
      acc.wholesale += r.wholesale_bottles;
    }
    return Array.from(map.entries())
      .map(([product, v]) => {
        const total = v.retail + v.wholesale;
        return {
          product,
          retail_btl: v.retail,
          wholesale_btl: v.wholesale,
          total_btl: total,
          retail_pct: total > 0 ? (v.retail / total) * 100 : 0,
          wholesale_pct: total > 0 ? (v.wholesale / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.total_btl - a.total_btl);
  }, [filtered, selectedFamily]);

  // ── HB Agency breakout (retail only) ──────────────────────────────────────
  const { hbSlices, hbStats } = useMemo(() => {
    const locMap = new Map<string, number>(); // hb_location → retail_bottles
    let externalRetail = 0;
    let hbWholesale = 0;

    for (const r of filtered) {
      if (r.is_hb_agency) {
        const loc = r.hb_location ?? 'Unknown';
        locMap.set(loc, (locMap.get(loc) ?? 0) + r.retail_bottles);
        hbWholesale += r.wholesale_bottles;
      } else {
        externalRetail += r.retail_bottles;
      }
    }

    const slices: HbSlice[] = [];
    for (const [loc, btl] of locMap.entries()) {
      if (btl > 0) {
        slices.push({ name: loc, value: btl, color: HB_COLORS[loc] ?? '#94a3b8' });
      }
    }
    if (externalRetail > 0) {
      slices.push({ name: 'External', value: externalRetail, color: HB_COLORS.External });
    }
    slices.sort((a, b) => b.value - a.value);

    const totalRetail = slices.reduce((s, sl) => s + sl.value, 0);
    const hbRetailTotal = slices
      .filter((sl) => sl.name !== 'External')
      .reduce((s, sl) => s + sl.value, 0);

    const stats: HbStats = {
      totalRetail,
      hbRetailTotal,
      externalRetail,
      hbWholesale,
    };

    return { hbSlices: slices, hbStats: stats };
  }, [filtered]);

  // ── Chart heights ──────────────────────────────────────────────────────────
  const familyChartHeight = Math.max(220, familyData.length * 46 + 20);
  const productChartHeight = Math.max(180, productData.length * 38 + 20);

  // ── Bar click handler ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleFamilyBarClick(entry: any) {
    const family: string | undefined = entry?.family;
    if (!family) return;
    setSelectedFamily((prev) => (prev === family ? null : family));
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        No data for selected filters.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Family split chart + HB donut */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* ── Brand Family Split ───────────────────────────────────────────── */}
        <div className="rounded-xl border border bg-card p-4">
          {/* Header + legend */}
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Brand Family Split</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                % Retail vs Wholesale by bottles · click a bar to drill down
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm inline-block shrink-0"
                  style={{ background: RETAIL_COLOR }}
                />
                <span className="text-muted-foreground">Retail</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm inline-block shrink-0"
                  style={{ background: WHOLESALE_COLOR }}
                />
                <span className="text-muted-foreground">Wholesale</span>
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={familyChartHeight}>
            <BarChart
              data={familyData}
              layout="vertical"
              margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
              barCategoryGap="32%"
            >
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="family"
                width={148}
                axisLine={false}
                tickLine={false}
                tick={
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ({ x, y, payload }: any) => (
                    <text
                      x={x}
                      y={y}
                      dy={4}
                      textAnchor="end"
                      fill={
                        selectedFamily === payload.value ? '#C5A572' : '#a1a1aa'
                      }
                      fontSize={11}
                      fontWeight={selectedFamily === payload.value ? 700 : 400}
                      cursor="pointer"
                      onClick={() =>
                        setSelectedFamily((p) =>
                          p === payload.value ? null : payload.value
                        )
                      }
                    >
                      {payload.value}
                    </text>
                  )
                }
              />
              <Tooltip
                content={<SplitTooltip />}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />

              {/* Retail bar */}
              <Bar
                dataKey="retail_pct"
                stackId="split"
                name="Retail"
                cursor="pointer"
                onClick={handleFamilyBarClick}
                isAnimationActive={false}
              >
                {familyData.map((entry) => (
                  <Cell
                    key={entry.family}
                    fill={RETAIL_COLOR}
                    fillOpacity={
                      !selectedFamily || selectedFamily === entry.family ? 1 : 0.25
                    }
                  />
                ))}
                <LabelList
                  dataKey="retail_pct"
                  position="insideLeft"
                  formatter={(v: number) =>
                    v >= 10 ? `${Math.round(v)}%` : ''
                  }
                  style={{ fill: '#1A1A1A', fontSize: 10, fontWeight: 700 }}
                />
              </Bar>

              {/* Wholesale bar */}
              <Bar
                dataKey="wholesale_pct"
                stackId="split"
                name="Wholesale"
                radius={[0, 3, 3, 0]}
                cursor="pointer"
                onClick={handleFamilyBarClick}
                isAnimationActive={false}
              >
                {familyData.map((entry) => (
                  <Cell
                    key={entry.family}
                    fill={WHOLESALE_COLOR}
                    fillOpacity={
                      !selectedFamily || selectedFamily === entry.family ? 1 : 0.25
                    }
                  />
                ))}
                <LabelList
                  dataKey="wholesale_pct"
                  position="insideRight"
                  formatter={(v: number) =>
                    v >= 10 ? `${Math.round(v)}%` : ''
                  }
                  style={{ fill: '#e2e8f0', fontSize: 10, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Hint */}
          {!selectedFamily && familyData.length > 0 && (
            <p className="mt-3 text-center text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <ChevronRight className="h-3 w-3" />
              Click a bar to see the product breakdown
            </p>
          )}
        </div>

        {/* ── HB Agency Breakout ───────────────────────────────────────────── */}
        <div className="rounded-xl border border bg-card p-4 flex flex-col">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">HB Agency Breakout</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Retail channel by location</p>
          </div>

          {hbSlices.length === 0 ? (
            <p className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              No HB retail data.
            </p>
          ) : (
            <>
              {/* Donut */}
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={hbSlices}
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive={false}
                    >
                      {hbSlices.map((slice, i) => (
                        <Cell
                          key={i}
                          fill={slice.color}
                          strokeWidth={0}
                          opacity={
                            hoveredSlice && hoveredSlice !== slice.name
                              ? 0.3
                              : 1
                          }
                          onMouseEnter={() => setHoveredSlice(slice.name)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground leading-none">
                      {fmtBtl(hbStats.totalRetail)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">btl retail</p>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-2 space-y-1">
                {hbSlices.map((slice) => {
                  const pct =
                    hbStats.totalRetail > 0
                      ? ((slice.value / hbStats.totalRetail) * 100).toFixed(0)
                      : '0';
                  return (
                    <div
                      key={slice.name}
                      className={`flex items-center justify-between text-xs px-2 py-1 rounded-md transition-colors cursor-default ${
                        hoveredSlice === slice.name
                          ? 'bg-muted'
                          : 'hover:bg-white/50'
                      }`}
                      onMouseEnter={() => setHoveredSlice(slice.name)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="shrink-0 w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-foreground truncate">{slice.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 tabular-nums ml-3">
                        <span className="text-muted-foreground">
                          {fmtBtl(slice.value)} btl
                        </span>
                        <span className="text-foreground font-medium w-7 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* HB vs External summary row */}
                <div className="pt-2 mt-1 border-t border grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center rounded-lg bg-white py-1.5 px-2">
                    <p className="text-primary font-bold">
                      {fmtBtl(hbStats.hbRetailTotal)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">HB Retail</p>
                  </div>
                  <div className="text-center rounded-lg bg-white py-1.5 px-2">
                    <p className="text-foreground font-bold">
                      {fmtBtl(hbStats.externalRetail)}
                    </p>
                    <p className="text-muted-foreground text-[10px]">External</p>
                  </div>
                </div>

                {/* HB wholesale badge (if any) */}
                {hbStats.hbWholesale > 0 && (
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-2 pt-1">
                    <span>HB wholesale (included in totals)</span>
                    <span className="font-mono text-primary/50">
                      {fmtBtl(hbStats.hbWholesale)} btl
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 2: Product drill-down (shown when a family is selected) */}
      {selectedFamily && (
        <div className="rounded-xl border border-primary/25 bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                <span className="text-primary">{selectedFamily}</span> — Product
                Split
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                % Retail vs Wholesale by bottles per product
              </p>
            </div>
            <button
              onClick={() => setSelectedFamily(null)}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {productData.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">
              No product data.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={productChartHeight}>
              <BarChart
                data={productData}
                layout="vertical"
                margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                barCategoryGap="28%"
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="product"
                  width={170}
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<SplitTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar
                  dataKey="retail_pct"
                  stackId="product"
                  fill={RETAIL_COLOR}
                  name="Retail"
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="retail_pct"
                    position="insideLeft"
                    formatter={(v: number) =>
                      v >= 10 ? `${Math.round(v)}%` : ''
                    }
                    style={{ fill: '#1A1A1A', fontSize: 10, fontWeight: 700 }}
                  />
                </Bar>
                <Bar
                  dataKey="wholesale_pct"
                  stackId="product"
                  fill={WHOLESALE_COLOR}
                  name="Wholesale"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="wholesale_pct"
                    position="insideRight"
                    formatter={(v: number) =>
                      v >= 10 ? `${Math.round(v)}%` : ''
                    }
                    style={{ fill: '#e2e8f0', fontSize: 10, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
