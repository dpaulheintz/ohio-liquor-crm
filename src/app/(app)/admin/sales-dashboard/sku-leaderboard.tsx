'use client';

import { useState, useMemo } from 'react';
import type { SkuMonthlyRow } from '@/app/actions/sales-dashboard';
import { ChevronUp, ChevronDown, ChevronsUpDown, Download, FileText } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Channel = 'all' | 'retail' | 'wholesale';

type SortKey =
  | 'product_name'
  | 'brand_family'
  | 'size'
  | 'retail_bottles'
  | 'wholesale_bottles'
  | 'total_bottles'
  | 'retail_amount'
  | 'wholesale_amount'
  | 'total_amount';

interface LeaderboardRow {
  brand_code: string;
  product_name: string;
  brand_family: string;
  size: string;
  retail_bottles: number;
  retail_amount: number;
  wholesale_bottles: number;
  wholesale_amount: number;
  total_bottles: number;
  total_amount: number;
  spark: number[]; // last 12 months of channel-appropriate bottles
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FAMILY_COLORS: Record<string, string> = {
  'Vodka': '#3b82f6',
  '(614) Vodka': '#06b6d4',
  'Gin': '#22c55e',
  'Whiskey War': '#C5A572',
  'Midnight': '#8b5cf6',
  'Midnight (Discontinued)': '#7c3aed',
  'Bourbon': '#f97316',
  'RTD': '#ec4899',
  'Unknown': '#6b7280',
};

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return (
    '$' +
    n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

function fmtBtl(n: number): string {
  return n.toLocaleString();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2 || data.every((v) => v === 0)) {
    return <span className="w-16 inline-block text-center text-zinc-700 text-xs">—</span>;
  }
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 64;
  const H = 22;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} className="shrink-0 overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FamilyBadge({ family }: { family: string }) {
  const color = FAMILY_COLORS[family] ?? '#6b7280';
  return (
    <span
      className="inline-flex items-center text-xs rounded-full px-2 py-0.5 font-medium whitespace-nowrap"
      style={{ backgroundColor: color + '22', color }}
    >
      {family}
    </span>
  );
}

function SortTh({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === col;
  const Icon = active
    ? sortDir === 'asc'
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2.5 text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-colors hover:text-zinc-200 ${
        active ? 'text-[#C5A572]' : 'text-zinc-500'
      }`}
    >
      <span
        className={`flex items-center gap-1 ${
          align === 'right' ? 'justify-end' : 'justify-start'
        }`}
      >
        {align === 'right' && <Icon className="h-3 w-3 shrink-0 opacity-70" />}
        {label}
        {align !== 'right' && <Icon className="h-3 w-3 shrink-0 opacity-70" />}
      </span>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SkuLeaderboardProps {
  skuMonthly: SkuMonthlyRow[];
  dateFrom: string;
  dateTo: string;
  selectedFamilies: string[];
  channel: Channel;
  maxMonth: string;
}

export function SkuLeaderboard({
  skuMonthly,
  dateFrom,
  dateTo,
  selectedFamilies,
  channel,
  maxMonth,
}: SkuLeaderboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total_bottles');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [rankBy, setRankBy] = useState<'bottles' | 'dollars'>('bottles');

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  }

  function handleRankBy(r: 'bottles' | 'dollars') {
    setRankBy(r);
    setSortKey(r === 'bottles' ? 'total_bottles' : 'total_amount');
    setSortDir('desc');
  }

  // ── Sparkline month window: last 12 months from maxMonth ──────────────────
  const sparkMonths = useMemo<string[]>(() => {
    const base = new Date(maxMonth + '-01');
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base);
      d.setMonth(base.getMonth() - (11 - i));
      return d.toISOString().slice(0, 7);
    });
  }, [maxMonth]);

  // ── Build leaderboard rows ─────────────────────────────────────────────────
  const rows = useMemo<LeaderboardRow[]>(() => {
    const inFamilies = (f: string) =>
      selectedFamilies.length === 0 || selectedFamilies.includes(f);

    // Per-SKU accumulators: totals (date-filtered) + spark buckets (last-12mo, not date-filtered)
    const totals = new Map<
      string,
      {
        brand_code: string;
        product_name: string;
        brand_family: string;
        size: string;
        retail_bottles: number;
        retail_amount: number;
        wholesale_bottles: number;
        wholesale_amount: number;
      }
    >();
    const sparks = new Map<string, Map<string, number>>(); // brand_code → month → bottles

    for (const r of skuMonthly) {
      if (!inFamilies(r.brand_family)) continue;

      // Sparkline accumulation — always last-12mo regardless of date filter
      if (sparkMonths.includes(r.month)) {
        if (!sparks.has(r.brand_code)) sparks.set(r.brand_code, new Map());
        const sm = sparks.get(r.brand_code)!;
        const sparkBtl =
          channel === 'retail'
            ? r.retail_bottles
            : channel === 'wholesale'
            ? r.wholesale_bottles
            : r.retail_bottles + r.wholesale_bottles;
        sm.set(r.month, (sm.get(r.month) ?? 0) + sparkBtl);
      }

      // Totals — apply date range
      if (r.month < dateFrom || r.month > dateTo) continue;

      if (!totals.has(r.brand_code)) {
        totals.set(r.brand_code, {
          brand_code: r.brand_code,
          product_name: r.product_name,
          brand_family: r.brand_family,
          size: r.size,
          retail_bottles: 0,
          retail_amount: 0,
          wholesale_bottles: 0,
          wholesale_amount: 0,
        });
      }
      const t = totals.get(r.brand_code)!;
      t.retail_bottles += r.retail_bottles;
      t.retail_amount += r.retail_amount;
      t.wholesale_bottles += r.wholesale_bottles;
      t.wholesale_amount += r.wholesale_amount;
    }

    return Array.from(totals.values()).map((t) => {
      const sparkMap = sparks.get(t.brand_code) ?? new Map<string, number>();
      const totalBtl =
        channel === 'retail'
          ? t.retail_bottles
          : channel === 'wholesale'
          ? t.wholesale_bottles
          : t.retail_bottles + t.wholesale_bottles;
      const totalAmt =
        channel === 'retail'
          ? t.retail_amount
          : channel === 'wholesale'
          ? t.wholesale_amount
          : t.retail_amount + t.wholesale_amount;
      return {
        ...t,
        total_bottles: totalBtl,
        total_amount: totalAmt,
        spark: sparkMonths.map((m) => sparkMap.get(m) ?? 0),
      };
    });
  }, [skuMonthly, dateFrom, dateTo, selectedFamilies, channel, sparkMonths]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sorted = useMemo<LeaderboardRow[]>(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') return dir * av.localeCompare(bv as string);
      return dir * ((av as number) - (bv as number));
    });
  }, [rows, sortKey, sortDir]);

  // ── Summary totals row ────────────────────────────────────────────────────
  const totalsRow = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        retail_bottles: acc.retail_bottles + r.retail_bottles,
        wholesale_bottles: acc.wholesale_bottles + r.wholesale_bottles,
        total_bottles: acc.total_bottles + r.total_bottles,
        retail_amount: acc.retail_amount + r.retail_amount,
        wholesale_amount: acc.wholesale_amount + r.wholesale_amount,
        total_amount: acc.total_amount + r.total_amount,
      }),
      {
        retail_bottles: 0,
        wholesale_bottles: 0,
        total_bottles: 0,
        retail_amount: 0,
        wholesale_amount: 0,
        total_amount: 0,
      }
    );
  }, [rows]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = [
      'Rank',
      'SKU',
      'Brand Family',
      'Size',
      'Retail Bottles',
      'Wholesale Bottles',
      'Total Bottles',
      'Retail Revenue',
      'Wholesale Revenue',
      'Total Revenue',
    ].join(',');

    const bodyRows = sorted.map((r, i) =>
      [
        i + 1,
        `"${r.product_name.replace(/"/g, '""')}"`,
        `"${r.brand_family.replace(/"/g, '""')}"`,
        r.size,
        r.retail_bottles,
        r.wholesale_bottles,
        r.total_bottles,
        r.retail_amount.toFixed(2),
        r.wholesale_amount.toFixed(2),
        r.total_amount.toFixed(2),
      ].join(',')
    );

    const totalLine = [
      '',
      '"TOTAL"',
      '""',
      '""',
      totalsRow.retail_bottles,
      totalsRow.wholesale_bottles,
      totalsRow.total_bottles,
      totalsRow.retail_amount.toFixed(2),
      totalsRow.wholesale_amount.toFixed(2),
      totalsRow.total_amount.toFixed(2),
    ].join(',');

    const csv = [header, ...bodyRows, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sku-leaderboard_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export PDF ────────────────────────────────────────────────────────────
  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header block
    doc.setFontSize(16);
    doc.setTextColor(197, 165, 114);
    doc.text('High Bank Distillery — SKU Leaderboard', 14, 16);

    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Period: ${dateFrom} → ${dateTo}   Channel: ${channel.toUpperCase()}   Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      14,
      22
    );

    autoTable(doc, {
      startY: 28,
      head: [
        [
          '#',
          'SKU',
          'Family',
          'Size',
          'Retail Btl',
          'Whsl Btl',
          'Total Btl',
          'Retail $',
          'Whsl $',
          'Total $',
        ],
      ],
      body: [
        ...sorted.map((r, i) => [
          i + 1,
          r.product_name,
          r.brand_family,
          r.size,
          r.retail_bottles.toLocaleString(),
          r.wholesale_bottles.toLocaleString(),
          r.total_bottles.toLocaleString(),
          fmtDollar(r.retail_amount),
          fmtDollar(r.wholesale_amount),
          fmtDollar(r.total_amount),
        ]),
        // Totals row
        [
          '',
          'TOTAL',
          '',
          '',
          totalsRow.retail_bottles.toLocaleString(),
          totalsRow.wholesale_bottles.toLocaleString(),
          totalsRow.total_bottles.toLocaleString(),
          fmtDollar(totalsRow.retail_amount),
          fmtDollar(totalsRow.wholesale_amount),
          fmtDollar(totalsRow.total_amount),
        ],
      ],
      styles: {
        fontSize: 8,
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        textColor: [30, 30, 30],
      },
      headStyles: {
        fillColor: [197, 165, 114],
        textColor: [20, 20, 20],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      // Totals row styling (last body row)
      didParseCell: (data) => {
        if (
          data.section === 'body' &&
          data.row.index === sorted.length
        ) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 230, 210];
        }
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 55 },
        2: { cellWidth: 32 },
        3: { cellWidth: 14 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        7: { halign: 'right', cellWidth: 24 },
        8: { halign: 'right', cellWidth: 24 },
        9: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
      },
    });

    doc.save(`sku-leaderboard_${dateFrom}_${dateTo}.pdf`);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Rank by</span>
          {(['bottles', 'dollars'] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleRankBy(r)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                rankBy === r
                  ? 'bg-[#C5A572] text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {r === 'bottles' ? 'Bottles Sold' : 'Revenue'}
            </button>
          ))}
          <span className="text-xs text-zinc-600 pl-1">
            {sorted.length} SKU{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[#0d0d0d] border-b border-zinc-800">
              <th className="px-3 py-2.5 text-xs font-medium text-zinc-600 w-9 text-center select-none">
                #
              </th>
              <SortTh
                col="product_name"
                label="SKU"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                col="brand_family"
                label="Family"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                col="size"
                label="Size"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                col="retail_bottles"
                label="Retail Btl"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                col="wholesale_bottles"
                label="Whsl Btl"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                col="total_bottles"
                label="Total Btl"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                col="retail_amount"
                label="Retail $"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                col="wholesale_amount"
                label="Whsl $"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                col="total_amount"
                label="Total $"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <th className="px-3 py-2.5 text-xs font-medium text-zinc-600 text-center whitespace-nowrap select-none">
                12mo Trend
              </th>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="py-10 text-center text-zinc-600 text-sm"
                >
                  No SKU data for selected filters.
                </td>
              </tr>
            ) : (
              <>
                {sorted.map((row, i) => (
                  <tr
                    key={row.brand_code}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors"
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5 text-xs font-mono text-zinc-600 text-center">
                      {i + 1}
                    </td>

                    {/* SKU name */}
                    <td className="px-3 py-2.5">
                      <span className="text-zinc-200 font-medium">{row.product_name}</span>
                    </td>

                    {/* Family */}
                    <td className="px-3 py-2.5">
                      <FamilyBadge family={row.brand_family} />
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2.5 text-zinc-500 text-xs font-mono">
                      {row.size || '—'}
                    </td>

                    {/* Retail Bottles */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
                      {fmtBtl(row.retail_bottles)}
                    </td>

                    {/* Wholesale Bottles */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
                      {fmtBtl(row.wholesale_bottles)}
                    </td>

                    {/* Total Bottles — highlighted */}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                      {fmtBtl(row.total_bottles)}
                    </td>

                    {/* Retail $ */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
                      {fmtDollar(row.retail_amount)}
                    </td>

                    {/* Wholesale $ */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-400">
                      {fmtDollar(row.wholesale_amount)}
                    </td>

                    {/* Total $ — gold */}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-[#C5A572]">
                      {fmtDollar(row.total_amount)}
                    </td>

                    {/* Sparkline */}
                    <td className="px-3 py-2.5 text-center">
                      <Sparkline
                        data={row.spark}
                        color={FAMILY_COLORS[row.brand_family] ?? '#94a3b8'}
                      />
                    </td>
                  </tr>
                ))}

                {/* Totals footer row */}
                <tr className="border-t-2 border-[#C5A572]/30 bg-[#111] font-semibold">
                  <td className="px-3 py-2.5" />
                  <td
                    colSpan={3}
                    className="px-3 py-2.5 text-xs text-zinc-400 uppercase tracking-wider"
                  >
                    Total — {sorted.length} SKUs
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">
                    {fmtBtl(totalsRow.retail_bottles)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">
                    {fmtBtl(totalsRow.wholesale_bottles)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-white">
                    {fmtBtl(totalsRow.total_bottles)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">
                    {fmtDollar(totalsRow.retail_amount)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-zinc-300">
                    {fmtDollar(totalsRow.wholesale_amount)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-[#C5A572]">
                    {fmtDollar(totalsRow.total_amount)}
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
