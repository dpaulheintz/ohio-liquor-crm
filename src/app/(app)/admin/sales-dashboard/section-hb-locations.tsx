'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { SplitRow } from '@/app/actions/sales-dashboard';
import { fmtDollar, fmtBottles, ChartTip } from './utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const HB_LOCATIONS = ['Grandview', 'Gahanna', 'Westerville'] as const;
type HbLocation = (typeof HB_LOCATIONS)[number];

const LOCATION_COLORS: Record<HbLocation, string> = {
  Grandview: '#C5A572',
  Gahanna: '#f97316',
  Westerville: '#22c55e',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionHbLocationsProps {
  splitRows: SplitRow[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionHbLocations({
  splitRows, selectedFamilies, dateFrom, dateTo,
}: SectionHbLocationsProps) {
  const [activeLocation, setActiveLocation] = useState<HbLocation | null>(null);
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // Only HB rows
  const hbRows = useMemo(
    () => splitRows.filter(r => r.is_hb_agency && r.hb_location && inFam(r.brand_family)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [splitRows, selectedFamilies],
  );

  // Date-filtered HB rows
  const hbFiltered = useMemo(
    () => hbRows.filter(r => r.month >= dateFrom && r.month <= dateTo),
    [hbRows, dateFrom, dateTo],
  );

  // ── KPIs per location ─────────────────────────────────────────────────────
  const locationKpis = useMemo(() => {
    const map = new Map<string, { revenue: number; bottles: number }>();
    for (const r of hbFiltered) {
      const loc = r.hb_location!;
      const e = map.get(loc) ?? { revenue: 0, bottles: 0 };
      e.revenue += r.retail_amount + r.wholesale_amount;
      e.bottles += r.retail_bottles + r.wholesale_bottles;
      map.set(loc, e);
    }
    return map;
  }, [hbFiltered]);

  // ── Location donut ─────────────────────────────────────────────────────────
  const donutData = useMemo(() => {
    return HB_LOCATIONS.map(loc => ({
      name: loc,
      value: locationKpis.get(loc)?.revenue ?? 0,
    })).filter(d => d.value > 0);
  }, [locationKpis]);
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  // ── Monthly trend per location ─────────────────────────────────────────────
  const trendData = useMemo(() => {
    // Build map: month → { location → revenue }
    const mmap = new Map<string, Record<string, number>>();
    for (const r of hbFiltered) {
      const loc = r.hb_location!;
      const e = mmap.get(r.month) ?? {};
      e[loc] = (e[loc] ?? 0) + r.retail_amount + r.wholesale_amount;
      mmap.set(r.month, e);
    }
    const result: Record<string, string | number>[] = [];
    const d = new Date(dateFrom + '-01');
    const end = new Date(dateTo + '-01');
    while (d <= end) {
      const key = d.toISOString().slice(0, 7);
      const row: Record<string, string | number> = {
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
      const data = mmap.get(key) ?? {};
      for (const loc of HB_LOCATIONS) row[loc] = data[loc] ?? null;
      result.push(row);
      d.setMonth(d.getMonth() + 1);
    }
    return result;
  }, [hbFiltered, dateFrom, dateTo]);

  // ── Location comparison bar ────────────────────────────────────────────────
  const comparisonData = useMemo(() => {
    return HB_LOCATIONS.map(loc => {
      const kpi = locationKpis.get(loc);
      return {
        name: loc,
        revenue: kpi?.revenue ?? 0,
        bottles: kpi?.bottles ?? 0,
      };
    });
  }, [locationKpis]);

  // ── Top products per location ──────────────────────────────────────────────
  const topProductsByLocation = useMemo(() => {
    const result: Record<string, { name: string; bottles: number; revenue: number }[]> = {};
    for (const loc of HB_LOCATIONS) {
      const pmap = new Map<string, { name: string; bottles: number; revenue: number }>();
      for (const r of hbFiltered) {
        if (r.hb_location !== loc) continue;
        const e = pmap.get(r.product_name) ?? { name: r.product_name, bottles: 0, revenue: 0 };
        e.bottles += r.retail_bottles + r.wholesale_bottles;
        e.revenue += r.retail_amount + r.wholesale_amount;
        pmap.set(r.product_name, e);
      }
      result[loc] = [...pmap.values()].sort((a, b) => b.bottles - a.bottles).slice(0, 8);
    }
    return result;
  }, [hbFiltered]);

  const hasData = hbFiltered.length > 0;

  return (
    <div className="space-y-4">
      {!hasData ? (
        <div className="rounded-xl border border bg-card p-10 text-center text-muted-foreground text-sm">
          No High Bank location data for the selected period.
        </div>
      ) : (
        <>
          {/* Location KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            {HB_LOCATIONS.map(loc => {
              const kpi = locationKpis.get(loc);
              return (
                <button
                  key={loc}
                  onClick={() => setActiveLocation(activeLocation === loc ? null : loc)}
                  className="rounded-xl border text-left px-5 py-4 flex flex-col gap-1.5 transition-all"
                  style={{
                    borderColor: activeLocation === loc
                      ? LOCATION_COLORS[loc]
                      : activeLocation
                      ? '#e5e5e5'
                      : '#d4d4d8',
                    background: activeLocation === loc ? LOCATION_COLORS[loc] + '15' : 'var(--card)',
                    opacity: activeLocation && activeLocation !== loc ? 0.5 : 1,
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-widest font-medium"
                    style={{ color: LOCATION_COLORS[loc] }}
                  >
                    {loc}
                  </span>
                  <span className="text-2xl font-serif font-bold text-foreground leading-none">
                    {fmtDollar(kpi?.revenue ?? 0)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtBottles(kpi?.bottles ?? 0)} bottles
                  </span>
                </button>
              );
            })}
          </div>

          {/* Donut + Comparison bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue donut */}
            <div className="rounded-xl border border bg-card p-4 flex flex-col">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 font-medium">
                Revenue by Location
              </h3>
              <div className="relative flex-1 flex items-center justify-center" style={{ minHeight: 180 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={80}
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {donutData.map(e => (
                        <Cell
                          key={e.name}
                          fill={LOCATION_COLORS[e.name as HbLocation] ?? '#94a3b8'}
                          fillOpacity={activeLocation && activeLocation !== e.name ? 0.3 : 0.9}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => fmtDollar(v)}
                      contentStyle={{ background: '#1C1C1C', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-foreground font-serif leading-none">
                    {fmtDollar(donutTotal)}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">HB total</span>
                </div>
              </div>
              <div className="flex justify-center gap-6 mt-2">
                {donutData.map(({ name, value }) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LOCATION_COLORS[name as HbLocation] }} />
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono text-foreground">{fmtDollar(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Location comparison bar */}
            <div className="rounded-xl border border bg-card p-4">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
                Location Revenue Comparison
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={comparisonData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtDollar} tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip
                    content={(props) => (
                      <ChartTip
                        active={props.active}
                        payload={props.payload as []}
                        label={String(props.label)}
                        fmt={fmtDollar}
                      />
                    )}
                  />
                  <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                    {comparisonData.map(d => (
                      <Cell
                        key={d.name}
                        fill={LOCATION_COLORS[d.name as HbLocation] ?? '#94a3b8'}
                        fillOpacity={activeLocation && activeLocation !== d.name ? 0.25 : 0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly trend per location */}
          <div className="rounded-xl border border bg-card p-4">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-medium">
              Monthly Revenue by HB Location
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtDollar} tick={{ fill: '#666666', fontSize: 9 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  content={(props) => (
                    <ChartTip
                      active={props.active}
                      payload={props.payload as []}
                      label={String(props.label)}
                      fmt={fmtDollar}
                    />
                  )}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: '#666666', paddingTop: 8 }}
                />
                {HB_LOCATIONS.map(loc => (
                  <Line
                    key={loc}
                    dataKey={loc}
                    name={loc}
                    stroke={LOCATION_COLORS[loc]}
                    strokeWidth={activeLocation && activeLocation !== loc ? 1 : 2.5}
                    strokeOpacity={activeLocation && activeLocation !== loc ? 0.3 : 1}
                    dot={{ r: 2.5, fill: LOCATION_COLORS[loc] }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top products per location */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {HB_LOCATIONS.map(loc => {
              const products = topProductsByLocation[loc] ?? [];
              const locColor = LOCATION_COLORS[loc];
              const maxBtl = products[0]?.bottles ?? 1;
              return (
                <div
                  key={loc}
                  className="rounded-xl border bg-card p-4"
                  style={{
                    borderColor: activeLocation === loc ? locColor : '#d4d4d8',
                    opacity: activeLocation && activeLocation !== loc ? 0.55 : 1,
                  }}
                >
                  <h3
                    className="text-[10px] uppercase tracking-widest font-medium mb-3"
                    style={{ color: locColor }}
                  >
                    {loc} — Top Products
                  </h3>
                  {products.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No data</p>
                  ) : (
                    <div className="space-y-2">
                      {products.map((p, i) => (
                        <div key={p.name} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 shrink-0 text-right font-mono">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground truncate leading-tight">{p.name}</p>
                            <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(p.bottles / maxBtl) * 100}%`,
                                  background: locColor,
                                  opacity: 0.7,
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-mono text-muted-foreground shrink-0">{p.bottles.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
