'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import type { WholesaleFullRow, AccountGroupData } from '@/app/actions/sales-dashboard';

// ─── Helpers (same logic as WholesaleLeaderboard) ─────────────────────────────

function isHighBank(wholesaler: string | null, dba: string | null): boolean {
  const w = (wholesaler ?? '').toUpperCase();
  const d = (dba ?? '').toUpperCase();
  return w.includes('HIGH BANK') || d.includes('HIGH BANK');
}

function resolveGroup(
  wholesaler: string | null,
  dba: string | null,
  groups: AccountGroupData[]
): { groupName: string; color: string } | null {
  const wl = (wholesaler ?? '').toLowerCase();
  const dl = (dba ?? '').toLowerCase();
  for (const group of groups) {
    const hit = (text: string) =>
      group.match_terms.some((term) => text.includes(term.toLowerCase()));
    const matched =
      group.match_columns === 'wholesaler' ? hit(wl) :
      group.match_columns === 'dba'        ? hit(dl) :
      hit(wl) || hit(dl);
    if (matched) return { groupName: group.group_name, color: group.color };
  }
  return null;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionBreweriesProps {
  wholesaleFull: WholesaleFullRow[];
  accountGroups: AccountGroupData[];
  selectedFamilies: string[];
  dateFrom: string;
  dateTo: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SectionBreweries({
  wholesaleFull, accountGroups, selectedFamilies, dateFrom, dateTo,
}: SectionBreweriesProps) {
  const inFam = (bf: string) => selectedFamilies.length === 0 || selectedFamilies.includes(bf);

  // Only brewery-flagged groups (excludes e.g. Elliot's)
  const breweryGroups = useMemo(
    () => accountGroups.filter(g => g.is_brewery),
    [accountGroups]
  );

  // Aggregate only rows that match a named brewery group, excluding HB
  const breweries = useMemo(() => {
    type Row = { name: string; bottles: number; revenue: number; color: string };
    const map = new Map<string, Row>();

    for (const r of wholesaleFull) {
      if (r.month < dateFrom || r.month > dateTo || !inFam(r.brand_family)) continue;
      if (isHighBank(r.wholesaler_name, r.dba)) continue;

      const grp = resolveGroup(r.wholesaler_name, r.dba, breweryGroups);
      if (!grp) continue; // skip ungrouped / non-brewery accounts

      const existing = map.get(grp.groupName) ?? { name: grp.groupName, bottles: 0, revenue: 0, color: grp.color };
      existing.bottles += r.bottles_sold;
      existing.revenue += r.amount;
      map.set(grp.groupName, existing);
    }

    return [...map.values()]
      .filter(r => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wholesaleFull, breweryGroups, selectedFamilies, dateFrom, dateTo]);

  const totalBottles = breweries.reduce((s, r) => s + r.bottles, 0);
  const totalRevenue = breweries.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Named Brewery Accounts</span>
          <span className="text-3xl font-serif font-bold text-white leading-none">{breweries.length}</span>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Total Bottles</span>
          <span className="text-3xl font-serif font-bold text-white leading-none">
            {totalBottles >= 1000 ? `${(totalBottles / 1000).toFixed(1)}k` : totalBottles.toLocaleString()}
          </span>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-[#111] px-5 py-4 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-medium">Total Revenue</span>
          <span className="text-3xl font-serif font-bold text-white leading-none">{fmtDollar(totalRevenue)}</span>
        </div>
      </div>

      {/* Horizontal bar chart — all brewery groups */}
      <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3 font-medium">
          Brewery Accounts Ranked by Revenue
        </h3>
        {breweries.length === 0 ? (
          <p className="py-10 text-center text-zinc-600 text-sm">No brewery data for selected range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, breweries.length * 34)}>
            <BarChart
              data={breweries}
              layout="vertical"
              margin={{ top: 0, right: 88, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tickFormatter={fmtDollar} tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: '#a1a1aa', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={180}
              />
              <Tooltip
                contentStyle={{ background: '#0f0f0f', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: '#e4e4e7' }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(v: number) => [fmtDollar(v), 'Revenue']}
              />
              <Bar dataKey="revenue" name="revenue" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {breweries.map((b, i) => (
                  <Cell key={i} fill={b.color} fillOpacity={0.85} />
                ))}
                <LabelList
                  dataKey="revenue"
                  position="right"
                  style={{ fill: '#a1a1aa', fontSize: 10 }}
                  formatter={(v: number) => fmtDollar(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>


    </div>
  );
}
