'use client';

import { useState, useMemo } from 'react';
import type { WholesaleFullRow, AccountGroupData } from '@/app/actions/sales-dashboard';
import { isHighBank } from './utils';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Download,
  FileText,
  Layers,
  BarChart2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overall' | 'by-sku';
type SortBy = 'displayName' | 'bottles' | 'amount';
type SortDir = 'asc' | 'desc';

interface AccountRow {
  key: string;
  displayName: string;
  isGroup: boolean;
  isHighBank: boolean;
  groupColor?: string;
  bottles: number;
  amount: number;
  topSku: string;
  spark: number[]; // last 12 months of bottles_sold
}

interface SkuOption {
  brand_code: string;
  label: string; // "Product Name (Size)"
  brand_family: string;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function resolveAccount(
  wholesaler: string | null,
  dba: string | null,
  groups: AccountGroupData[]
): { key: string; displayName: string; isGroup: boolean; groupColor?: string } {
  const wl = (wholesaler ?? '').toLowerCase();
  const dl = (dba ?? '').toLowerCase();

  for (const group of groups) {
    const hit = (text: string) =>
      group.match_terms.some((term) => text.includes(term.toLowerCase()));

    const matched =
      group.match_columns === 'wholesaler'
        ? hit(wl)
        : group.match_columns === 'dba'
        ? hit(dl)
        : hit(wl) || hit(dl);

    if (matched) {
      return {
        key: `group::${group.id}`,
        displayName: group.group_name,
        isGroup: true,
        groupColor: group.color,
      };
    }
  }

  const name = wholesaler?.trim() || dba?.trim() || 'Unknown Account';
  return { key: `raw::${name}`, displayName: name, isGroup: false };
}

// Core aggregation: build AccountRow[] from raw wholesale rows.
// Sparklines use the last-12-months window; totals are date-filtered.
function buildAccountRows(
  data: WholesaleFullRow[],
  groups: AccountGroupData[],
  dateFrom: string,
  dateTo: string,
  selectedFamilies: string[],
  sparkMonths: string[],
  skuCode?: string // if set, filter to this brand_code only
): AccountRow[] {
  const inFamily = (f: string) =>
    selectedFamilies.length === 0 || selectedFamilies.includes(f);

  type Acc = {
    key: string;
    displayName: string;
    isGroup: boolean;
    isHighBank: boolean;
    groupColor?: string;
    bottles: number;
    amount: number;
    products: Map<string, number>;
    sparkByMonth: Map<string, number>;
  };

  const map = new Map<string, Acc>();

  for (const r of data) {
    if (!inFamily(r.brand_family)) continue;
    if (skuCode && r.brand_code !== skuCode) continue;

    const resolved = resolveAccount(r.wholesaler_name, r.dba, groups);
    const hb = isHighBank(r.wholesaler_name, r.dba);

    if (!map.has(resolved.key)) {
      map.set(resolved.key, {
        key: resolved.key,
        displayName: resolved.displayName,
        isGroup: resolved.isGroup,
        isHighBank: hb,
        groupColor: resolved.groupColor,
        bottles: 0,
        amount: 0,
        products: new Map(),
        sparkByMonth: new Map(),
      });
    }

    const acc = map.get(resolved.key)!;
    if (hb) acc.isHighBank = true;

    // Sparkline (last 12 months, ignores date filter)
    if (sparkMonths.includes(r.month)) {
      acc.sparkByMonth.set(
        r.month,
        (acc.sparkByMonth.get(r.month) ?? 0) + r.bottles_sold
      );
    }

    // Totals (date-filtered)
    if (r.month >= dateFrom && r.month <= dateTo) {
      acc.bottles += r.bottles_sold;
      acc.amount += r.amount;
      acc.products.set(
        r.product_name,
        (acc.products.get(r.product_name) ?? 0) + r.bottles_sold
      );
    }
  }

  return Array.from(map.values())
    .filter((acc) => acc.bottles > 0)
    .map((acc) => {
      const topSku =
        [...acc.products.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
      return {
        key: acc.key,
        displayName: acc.displayName,
        isGroup: acc.isGroup,
        isHighBank: acc.isHighBank,
        groupColor: acc.groupColor,
        bottles: acc.bottles,
        amount: acc.amount,
        topSku,
        spark: sparkMonths.map((m) => acc.sparkByMonth.get(m) ?? 0),
      };
    });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtBtl(n: number) {
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

function AccountCell({ row }: { row: AccountRow }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Group color dot */}
      {row.isGroup && row.groupColor && (
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: row.groupColor }}
        />
      )}

      {/* Name */}
      <span className="text-zinc-200 font-medium truncate">{row.displayName}</span>

      {/* HIGH BANK badge */}
      {row.isHighBank && (
        <span className="shrink-0 inline-flex items-center text-[10px] font-bold rounded px-1.5 py-0.5 bg-[#C5A572]/20 text-[#C5A572] border border-[#C5A572]/40 uppercase tracking-wider">
          HB
        </span>
      )}

      {/* Group badge */}
      {row.isGroup && (
        <span className="shrink-0 text-[10px] text-zinc-500 rounded px-1.5 py-0.5 bg-zinc-800 uppercase tracking-wider">
          group
        </span>
      )}
    </div>
  );
}

function SortableHeader({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
  align = 'left',
}: {
  col: SortBy;
  label: string;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (col: SortBy) => void;
  align?: 'left' | 'right';
}) {
  const active = sortBy === col;
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
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

interface WholesaleLeaderboardProps {
  wholesaleFull: WholesaleFullRow[];
  accountGroups: AccountGroupData[];
  dateFrom: string;
  dateTo: string;
  selectedFamilies: string[];
  maxMonth: string;
}

export function WholesaleLeaderboard({
  wholesaleFull,
  accountGroups,
  dateFrom,
  dateTo,
  selectedFamilies,
  maxMonth,
}: WholesaleLeaderboardProps) {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('overall');
  const [sortBy, setSortBy] = useState<SortBy>('bottles');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [selectedSkuCode, setSelectedSkuCode] = useState<string>('');

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSearch('');
    setSortBy('bottles');
    setSortDir('desc');
  }

  function handleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  // ── Sparkline month window ─────────────────────────────────────────────────
  const sparkMonths = useMemo<string[]>(() => {
    const base = new Date(maxMonth + '-01');
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(base);
      d.setMonth(base.getMonth() - (11 - i));
      return d.toISOString().slice(0, 7);
    });
  }, [maxMonth]);

  // ── SKU options for By-SKU dropdown ────────────────────────────────────────
  const skuOptions = useMemo<SkuOption[]>(() => {
    const seen = new Map<string, SkuOption>();
    for (const r of wholesaleFull) {
      if (selectedFamilies.length > 0 && !selectedFamilies.includes(r.brand_family)) continue;
      if (!seen.has(r.brand_code)) {
        seen.set(r.brand_code, {
          brand_code: r.brand_code,
          label: r.size ? `${r.product_name} (${r.size})` : r.product_name,
          brand_family: r.brand_family,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [wholesaleFull, selectedFamilies]);

  // Resolve effective SKU (default to first option if none explicitly set)
  const effectiveSku = selectedSkuCode || skuOptions[0]?.brand_code || '';

  // ── Account row aggregation ────────────────────────────────────────────────
  const overallRows = useMemo(
    () =>
      buildAccountRows(
        wholesaleFull,
        accountGroups,
        dateFrom,
        dateTo,
        selectedFamilies,
        sparkMonths
      ),
    [wholesaleFull, accountGroups, dateFrom, dateTo, selectedFamilies, sparkMonths]
  );

  const bySkuRows = useMemo(
    () =>
      effectiveSku
        ? buildAccountRows(
            wholesaleFull,
            accountGroups,
            dateFrom,
            dateTo,
            selectedFamilies,
            sparkMonths,
            effectiveSku
          )
        : [],
    [wholesaleFull, accountGroups, dateFrom, dateTo, selectedFamilies, sparkMonths, effectiveSku]
  );

  // ── Search + sort ──────────────────────────────────────────────────────────
  const displayRows = useMemo<AccountRow[]>(() => {
    const base = activeTab === 'overall' ? overallRows : bySkuRows;
    const rows = search.trim()
      ? base.filter((r) => r.displayName.toLowerCase().includes(search.toLowerCase()))
      : [...base];

    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortBy === 'displayName') return dir * a.displayName.localeCompare(b.displayName);
      if (sortBy === 'bottles') return dir * (a.bottles - b.bottles);
      return dir * (a.amount - b.amount);
    });

    return rows;
  }, [activeTab, overallRows, bySkuRows, search, sortBy, sortDir]);

  // ── Totals footer ──────────────────────────────────────────────────────────
  const totals = useMemo(
    () => ({
      bottles: displayRows.reduce((s, r) => s + r.bottles, 0),
      amount: displayRows.reduce((s, r) => s + r.amount, 0),
    }),
    [displayRows]
  );

  // ── Color for sparklines: default blue for ungrouped ──────────────────────
  function sparkColor(row: AccountRow) {
    return row.groupColor ?? (row.isHighBank ? '#C5A572' : '#94a3b8');
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCsv() {
    const showTopSku = activeTab === 'overall';
    const header = [
      'Rank',
      'Account',
      'Group',
      'Bottles',
      'Revenue',
      ...(showTopSku ? ['Top SKU'] : []),
    ].join(',');

    const body = displayRows.map((r, i) =>
      [
        i + 1,
        `"${r.displayName.replace(/"/g, '""')}"`,
        r.isGroup ? 'Yes' : 'No',
        r.bottles,
        r.amount.toFixed(2),
        ...(showTopSku ? [`"${r.topSku.replace(/"/g, '""')}"`] : []),
      ].join(',')
    );

    const totalLine = [
      '',
      '"TOTAL"',
      '',
      totals.bottles,
      totals.amount.toFixed(2),
      ...(showTopSku ? ['""'] : []),
    ].join(',');

    const csv = [header, ...body, totalLine].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix =
      activeTab === 'by-sku' && effectiveSku
        ? `_${skuOptions.find((o) => o.brand_code === effectiveSku)?.label ?? effectiveSku}`
        : '';
    a.download = `wholesale-accounts${suffix}_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export PDF ────────────────────────────────────────────────────────────
  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const showTopSku = activeTab === 'overall';
    const skuLabel =
      activeTab === 'by-sku'
        ? skuOptions.find((o) => o.brand_code === effectiveSku)?.label ?? ''
        : '';

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.setTextColor(197, 165, 114);
    doc.text(
      `High Bank Distillery — Wholesale Account Leaderboard${skuLabel ? `: ${skuLabel}` : ''}`,
      14,
      16
    );

    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Period: ${dateFrom} → ${dateTo}   Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      14,
      22
    );

    const head = [
      ['#', 'Account', 'Group?', 'Bottles', 'Revenue', ...(showTopSku ? ['Top SKU'] : [])],
    ];
    const body = [
      ...displayRows.map((r, i) => [
        i + 1,
        r.displayName + (r.isHighBank ? ' ★ HB' : ''),
        r.isGroup ? 'Yes' : 'No',
        r.bottles.toLocaleString(),
        fmtDollar(r.amount),
        ...(showTopSku ? [r.topSku] : []),
      ]),
      [
        '',
        'TOTAL',
        '',
        totals.bottles.toLocaleString(),
        fmtDollar(totals.amount),
        ...(showTopSku ? [''] : []),
      ],
    ];

    autoTable(doc, {
      startY: 28,
      head,
      body,
      styles: { fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 }, textColor: [30, 30, 30] },
      headStyles: { fillColor: [197, 165, 114], textColor: [20, 20, 20], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === displayRows.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 230, 210];
        }
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: showTopSku ? 65 : 80 },
        2: { cellWidth: 14, halign: 'center' },
        3: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
        4: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
        ...(showTopSku ? { 5: { cellWidth: 55 } } : {}),
      },
    });

    doc.save(
      `wholesale-accounts${skuLabel ? `_${skuLabel}` : ''}_${dateFrom}_${dateTo}.pdf`
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const selectedSkuOption = skuOptions.find((o) => o.brand_code === effectiveSku);

  return (
    <div className="space-y-4">
      {/* Tab strip */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
          <button
            onClick={() => switchTab('overall')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'overall'
                ? 'bg-[#C5A572] text-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Overall
          </button>
          <button
            onClick={() => switchTab('by-sku')}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'by-sku'
                ? 'bg-[#C5A572] text-black'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart2 className="h-3.5 w-3.5" />
            By SKU
          </button>
        </div>

        {/* Export buttons */}
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

      {/* By-SKU: product dropdown */}
      {activeTab === 'by-sku' && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">Product</span>
          <select
            value={effectiveSku}
            onChange={(e) => setSelectedSkuCode(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 text-sm focus:outline-none focus:border-[#C5A572]/60 min-w-[240px]"
          >
            {skuOptions.map((opt) => (
              <option key={opt.brand_code} value={opt.brand_code}>
                {opt.label}
              </option>
            ))}
          </select>
          {selectedSkuOption && (
            <span
              className="text-xs rounded-full px-2 py-0.5"
              style={{
                backgroundColor: '#94a3b822',
                color: '#94a3b8',
              }}
            >
              {selectedSkuOption.brand_family}
            </span>
          )}
        </div>
      )}

      {/* Search bar + row count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[#C5A572]/60"
          />
        </div>
        <span className="text-xs text-zinc-600">
          {displayRows.length} account{displayRows.length !== 1 ? 's' : ''}
          {accountGroups.length > 0 && (
            <span className="ml-1 text-zinc-700">
              · {accountGroups.length} group{accountGroups.length !== 1 ? 's' : ''} applied
            </span>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-[#0d0d0d] border-b border-zinc-800">
              <th className="px-3 py-2.5 text-xs font-medium text-zinc-600 w-9 text-center select-none">
                #
              </th>
              <SortableHeader
                col="displayName"
                label="Account"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader
                col="bottles"
                label="Bottles"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortableHeader
                col="amount"
                label="Revenue"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              {activeTab === 'overall' && (
                <th className="px-3 py-2.5 text-xs font-medium text-zinc-500 select-none whitespace-nowrap">
                  Top SKU
                </th>
              )}
              <th className="px-3 py-2.5 text-xs font-medium text-zinc-600 text-center whitespace-nowrap select-none">
                12mo Trend
              </th>
            </tr>
          </thead>

          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={activeTab === 'overall' ? 6 : 5}
                  className="py-10 text-center text-zinc-600 text-sm"
                >
                  No wholesale data for selected filters.
                </td>
              </tr>
            ) : (
              <>
                {displayRows.map((row, i) => (
                  <tr
                    key={row.key}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors"
                  >
                    {/* Rank */}
                    <td className="px-3 py-2.5 text-xs font-mono text-zinc-600 text-center">
                      {i + 1}
                    </td>

                    {/* Account */}
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <AccountCell row={row} />
                    </td>

                    {/* Bottles */}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-white">
                      {fmtBtl(row.bottles)}
                    </td>

                    {/* Revenue */}
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-[#C5A572]">
                      {fmtDollar(row.amount)}
                    </td>

                    {/* Top SKU (Overall tab only) */}
                    {activeTab === 'overall' && (
                      <td className="px-3 py-2.5 text-zinc-400 text-xs max-w-[180px]">
                        <span className="truncate block">{row.topSku}</span>
                      </td>
                    )}

                    {/* Sparkline */}
                    <td className="px-3 py-2.5 text-center">
                      <Sparkline data={row.spark} color={sparkColor(row)} />
                    </td>
                  </tr>
                ))}

                {/* Totals footer */}
                <tr className="border-t-2 border-[#C5A572]/30 bg-[#111] font-semibold">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-xs text-zinc-400 uppercase tracking-wider">
                    Total — {displayRows.length} account{displayRows.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-white">
                    {fmtBtl(totals.bottles)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm text-[#C5A572]">
                    {fmtDollar(totals.amount)}
                  </td>
                  {activeTab === 'overall' && <td className="px-3 py-2.5" />}
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
