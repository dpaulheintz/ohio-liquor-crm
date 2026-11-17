// Bottle Sales: report tables for the dashboard exports (CSV / XLSX / Month-End Summary).
// Pure functions (no DOM) so the same code can be checked from a script. Money is integer cents.
// Accounting posts per location, so every exported row carries agency_number and gl_account:
// tables that would otherwise mix locations are broken out by location, and grand-total rows say "All".
import { SALE_TYPES, monthLabel, type BottleLocation } from '@/lib/bottle-sales';

export type Cell = string | number | { usd: number } | null; // { usd: cents }
export interface Table { title: string; header: string[]; rows: Cell[][] }
export interface Sheet { name: string; tables: Table[] }

/** d date, loc, t type, sku, b bottles, u units/case, p/w/r paid/wholesale/retail in cents */
export interface DashLine { d: string; loc: string; t: string; sku: string; b: number; u: number; p: number; w: number; r: number }
export interface Prod { sku: string; name: string; group: string; sort: number }
export interface Agg { b: number; c: number; p: number; w: number; r: number }

export const zero = (): Agg => ({ b: 0, c: 0, p: 0, w: 0, r: 0 });
export const add = (a: Agg, l: DashLine) => { a.b += l.b; a.c += l.b / l.u; a.p += l.p; a.w += l.w; a.r += l.r; return a; };
export const sum = (ls: DashLine[]) => ls.reduce(add, zero());
const plus = (a: Agg, b: Agg | undefined): Agg => (b ? { b: a.b + b.b, c: a.c + b.c, p: a.p + b.p, w: a.w + b.w, r: a.r + b.r } : a);

export const AGG_HEAD = ['Bottles', 'Cases', 'Paid to us (DSP)', 'Wholesale value', 'Retail value (MSRP)'];
export const aggCells = (a: Agg): Cell[] => [a.b, Math.round(a.c * 10) / 10, { usd: a.p }, { usd: a.w }, { usd: a.r }];
const ALL = 'All';

export interface GlGroup { gl: string; agencies: string[]; locations: BottleLocation[] }

/** Locations grouped by GL account (Westerville + PO Box 21 share 4322). Unset GLs group as "(none)". */
export function glGroups(locations: BottleLocation[]): GlGroup[] {
  const map = new Map<string, GlGroup>();
  for (const l of locations) {
    const gl = l.gl_account || '(none)';
    const g = map.get(gl) ?? { gl, agencies: [], locations: [] };
    g.locations.push(l);
    if (l.agency_number && !g.agencies.includes(l.agency_number)) g.agencies.push(l.agency_number);
    map.set(gl, g);
  }
  return [...map.values()].sort((a, b) => a.gl.localeCompare(b.gl, undefined, { numeric: true }));
}

export const glNote = (g: GlGroup) => (g.locations.length > 1 ? `Combines ${g.locations.map((l) => l.name).join(' + ')}` : g.locations[0]?.name ?? '');

export function byGl(lines: DashLine[], locations: BottleLocation[]) {
  return glGroups(locations).map((g) => {
    const codes = new Set(g.locations.map((l) => l.code));
    return { ...g, a: sum(lines.filter((l) => codes.has(l.loc))) };
  });
}

function locCols(l: BottleLocation | undefined, code: string): Cell[] {
  return [l?.name ?? code, l?.agency_number ?? '', l?.gl_account ?? ''];
}

export interface ReportInput {
  lines: DashLine[];          // already filtered to the period, location and type
  products: Prod[];
  locations: BottleLocation[];
  periodLabel: string;
  months: string[];           // fiscal-year months for the matrix
  matrixLines: DashLine[];    // FY lines (location/type filtered) for the matrix
  matrixMetric: { key: 'b' | 'c' | 'p' | 'w'; label: string };
}

/** Everything the dashboard shows, as export tables — every row tagged with agency_number and gl_account. */
export function buildScreenTables(i: ReportInput): Table[] {
  const prod = new Map(i.products.map((p) => [p.sku, p]));
  const locs = i.locations;
  const total = sum(i.lines);
  const LOC_HEAD = ['Location', 'agency_number', 'gl_account'];

  const perLoc = locs.map((l) => ({ l, a: sum(i.lines.filter((x) => x.loc === l.code)) }));
  const metricCell = (a: Agg | undefined): Cell => {
    const v = a ? a[i.matrixMetric.key] : 0;
    return i.matrixMetric.key === 'p' || i.matrixMetric.key === 'w' ? { usd: v } : i.matrixMetric.key === 'c' ? Math.round(v * 10) / 10 : v;
  };

  // Monthly matrix: SKU × location
  const cells = new Map<string, Map<string, Record<string, Agg>>>(); // sku → loc → month → agg
  for (const l of i.matrixLines) {
    const byLoc = cells.get(l.sku) ?? new Map<string, Record<string, Agg>>();
    const r = byLoc.get(l.loc) ?? {};
    const m = l.d.slice(0, 7);
    r[m] = add(r[m] ?? zero(), l);
    byLoc.set(l.loc, r); cells.set(l.sku, byLoc);
  }
  const skuOrder = [...cells.keys()].sort((a, b) => (prod.get(a)?.sort ?? 0) - (prod.get(b)?.sort ?? 0) || a.localeCompare(b));
  const matrixRows: Cell[][] = [];
  for (const sku of skuOrder) {
    for (const l of locs) {
      const r = cells.get(sku)!.get(l.code);
      if (!r) continue;
      const tot = i.months.reduce((t, m) => plus(t, r[m]), zero());
      matrixRows.push([sku, prod.get(sku)?.name ?? sku, prod.get(sku)?.group ?? '', ...locCols(l, l.code), ...i.months.map((m) => metricCell(r[m])), metricCell(tot)]);
    }
  }
  const monthTotals = i.months.map((m) => sum(i.matrixLines.filter((l) => l.d.startsWith(m))));
  matrixRows.push(['Total', '', '', ALL, ALL, ALL, ...monthTotals.map(metricCell), metricCell(sum(i.matrixLines))]);

  // Top SKUs (by paid $), each split by location
  const bySku = new Map<string, Agg>();
  for (const l of i.lines) bySku.set(l.sku, add(bySku.get(l.sku) ?? zero(), l));
  const top = [...bySku.entries()].sort((a, b) => b[1].p - a[1].p).slice(0, 10).map(([sku]) => sku);
  const topRows: Cell[][] = top.flatMap((sku) => locs
    .map((l) => ({ l, a: sum(i.lines.filter((x) => x.sku === sku && x.loc === l.code)) }))
    .filter((x) => x.a.b)
    .map((x) => [sku, prod.get(sku)?.name ?? sku, ...locCols(x.l, x.l.code), ...aggCells(x.a)]));

  return [
    { title: `Bottle Sales · ${i.periodLabel}`, header: [...LOC_HEAD, ...AGG_HEAD], rows: [...perLoc.map((x) => [...locCols(x.l, x.l.code), ...aggCells(x.a)]), ['Total', ALL, ALL, ...aggCells(total)]] },
    {
      title: 'By Type', header: ['Type', ...LOC_HEAD, ...AGG_HEAD],
      rows: [
        ...SALE_TYPES.flatMap((t) => locs.map((l) => ({ t, l, a: sum(i.lines.filter((x) => x.t === t && x.loc === l.code)) })).filter((x) => x.a.b)
          .map((x) => [x.t, ...locCols(x.l, x.l.code), ...aggCells(x.a)])),
        ['Total', ALL, ALL, ALL, ...aggCells(total)],
      ],
    },
    { title: 'By Location', header: [...LOC_HEAD, ...AGG_HEAD], rows: [...perLoc.map((x) => [...locCols(x.l, x.l.code), ...aggCells(x.a)]), ['Total', ALL, ALL, ...aggCells(total)]] },
    glTable(`By GL Account · ${i.periodLabel}`, i.lines, locs),
    {
      title: `Monthly matrix (${i.matrixMetric.label}) · by location`,
      header: ['SKU', 'Product', 'Group', ...LOC_HEAD, ...i.months.map((m) => monthLabel(m, true)), 'Total'],
      rows: matrixRows,
    },
    { title: 'Top SKUs · by location', header: ['SKU', 'Product', ...LOC_HEAD, ...AGG_HEAD], rows: topRows },
    detailTable(`Detail · every sales line · ${i.periodLabel}`, i.lines, prod, locs),
  ];
}

/** One line per GL account + grand total. */
export function glTable(title: string, lines: DashLine[], locations: BottleLocation[]): Table {
  const rows: Cell[][] = byGl(lines, locations).map((g) => [g.gl, g.agencies.join(', '), glNote(g), ...aggCells(g.a)]);
  rows.push(['Grand total', ALL, ALL, ...aggCells(sum(lines))]);
  return { title, header: ['gl_account', 'agency_number', 'Locations', ...AGG_HEAD], rows };
}

export function detailTable(title: string, lines: DashLine[], prod: Map<string, Prod>, locations: BottleLocation[]): Table {
  const loc = new Map(locations.map((l) => [l.code, l]));
  const sorted = [...lines].sort((a, b) => a.d.localeCompare(b.d) || a.loc.localeCompare(b.loc) || a.t.localeCompare(b.t) || a.sku.localeCompare(b.sku));
  const rows: Cell[][] = sorted.map((l) => {
    const lo = loc.get(l.loc);
    return [l.d, lo?.name ?? l.loc, lo?.agency_number ?? '', lo?.gl_account ?? '', l.t, l.sku, prod.get(l.sku)?.name ?? l.sku,
      l.b, Math.round((l.b / l.u) * 100) / 100, { usd: l.p }, { usd: l.w }, { usd: l.r }];
  });
  const t = sum(lines);
  rows.push(['Total', ALL, ALL, ALL, '', '', '', t.b, Math.round(t.c * 100) / 100, { usd: t.p }, { usd: t.w }, { usd: t.r }]);
  return { title, header: ['Date', 'Location', 'agency_number', 'gl_account', 'Type', 'SKU', 'Product', 'Bottles', 'Cases', 'Paid to us (DSP)', 'Wholesale value', 'Retail value (MSRP)'], rows };
}

/**
 * Month-End Summary for one month, all locations and types:
 *  • sheet 1: one section per location (Location · Agency # · GL #) split Retail / Bar / Batch, then the
 *    GL rollup (one line per GL account to post) and a grand total
 *  • sheet 2: by SKU and location;  • sheet 3: every sales line
 */
export function buildMonthEnd(month: string, allLines: DashLine[], products: Prod[], locations: BottleLocation[]): { sheets: Sheet[]; grandTotal: Agg; gl: ReturnType<typeof byGl> } {
  const prod = new Map(products.map((p) => [p.sku, p]));
  const ls = allLines.filter((l) => l.d.startsWith(month));
  const label = monthLabel(month, true);
  const head = ['Type', 'Location', 'agency_number', 'gl_account', ...AGG_HEAD];

  const sections: Table[] = locations.map((l) => {
    const here = ls.filter((x) => x.loc === l.code);
    const rows: Cell[][] = SALE_TYPES.map((t) => [t, l.name, l.agency_number ?? '', l.gl_account ?? '', ...aggCells(sum(here.filter((x) => x.t === t)))]);
    rows.push([`Total ${l.name}`, l.name, l.agency_number ?? '', l.gl_account ?? '', ...aggCells(sum(here))]);
    return { title: `${l.name} · Agency # ${l.agency_number ?? '—'} · GL # ${l.gl_account ?? '—'}`, header: head, rows };
  });
  const gl = byGl(ls, locations);
  const rollup = glTable(`GL rollup · totals to post · ${label}`, ls, locations);

  const skuRows: Cell[][] = [];
  const skus = [...new Set(ls.map((l) => l.sku))].sort((a, b) => (prod.get(a)?.sort ?? 0) - (prod.get(b)?.sort ?? 0) || a.localeCompare(b));
  for (const sku of skus) for (const l of locations) {
    const a = sum(ls.filter((x) => x.sku === sku && x.loc === l.code));
    if (a.b) skuRows.push([sku, prod.get(sku)?.name ?? sku, prod.get(sku)?.group ?? '', l.name, l.agency_number ?? '', l.gl_account ?? '', ...aggCells(a)]);
  }
  skuRows.push(['Total', '', '', ALL, ALL, ALL, ...aggCells(sum(ls))]);

  return {
    grandTotal: sum(ls),
    gl,
    sheets: [
      { name: 'By Location + GL', tables: [{ title: `Month-End Summary · ${label} · all locations`, header: [], rows: [] }, ...sections, rollup] },
      { name: 'By SKU', tables: [{ title: `By SKU and location · ${label}`, header: ['SKU', 'Product', 'Group', 'Location', 'agency_number', 'gl_account', ...AGG_HEAD], rows: skuRows }] },
      { name: 'Detail', tables: [detailTable(`Every sales line · ${label}`, ls, prod, locations)] },
    ],
  };
}
