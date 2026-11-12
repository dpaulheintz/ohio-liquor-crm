'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  REPORT_GROUPS, SALE_TYPES, fiscalMonths, fiscalYearOf, fmtCases, fmtInt, fmtUsd, monthLabel, type BottleLocation,
} from '@/lib/bottle-sales';
import { exportCsv, exportXlsx, type Cell, type Table } from './export';

/** d date, loc, t type, sku, b bottles, u units/case, p/w/r paid/wholesale/retail in cents */
export interface DashLine { d: string; loc: string; t: string; sku: string; b: number; u: number; p: number; w: number; r: number }
interface Prod { sku: string; name: string; group: string; sort: number }
interface Agg { b: number; c: number; p: number; w: number; r: number }

const zero = (): Agg => ({ b: 0, c: 0, p: 0, w: 0, r: 0 });
const add = (a: Agg, l: DashLine) => { a.b += l.b; a.c += l.b / l.u; a.p += l.p; a.w += l.w; a.r += l.r; return a; };
const sum = (ls: DashLine[]) => ls.reduce(add, zero());
const TYPE_COLORS: Record<string, string> = { Retail: '#2a78d6', Bar: '#eb6834', Batch: '#1baf7a' };
type Metric = 'b' | 'c' | 'p' | 'w';
const METRICS: { key: Metric; label: string }[] = [{ key: 'b', label: 'Bottles' }, { key: 'c', label: 'Cases' }, { key: 'p', label: 'Paid $' }, { key: 'w', label: 'Wholesale $' }];
const fmtMetric = (m: Metric, v: number) => (m === 'b' ? fmtInt(v) : m === 'c' ? fmtCases(v) : fmtUsd(v));
const cellMetric = (m: Metric, v: number): Cell => (m === 'p' || m === 'w' ? { usd: v } : m === 'c' ? Math.round(v * 10) / 10 : v);
const selectCls = 'h-10 rounded-md border bg-background px-2 text-sm';

export function DashboardClient({ lines, products, locations, fyStart, today }: { lines: DashLine[]; products: Prod[]; locations: BottleLocation[]; fyStart: number; today: string }) {
  const prodMap = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const fys = useMemo(() => {
    const s = new Set(lines.map((l) => fiscalYearOf(l.d, fyStart)));
    s.add(fiscalYearOf(today, fyStart));
    return [...s].sort((a, b) => b - a);
  }, [lines, fyStart, today]);
  const latestWithData = useMemo(() => (lines.length ? Math.max(...lines.map((l) => fiscalYearOf(l.d, fyStart))) : fiscalYearOf(today, fyStart)), [lines, fyStart, today]);
  const [fy, setFy] = useState(latestWithData);
  const [month, setMonth] = useState('');
  const [loc, setLoc] = useState('');
  const [type, setType] = useState('');
  const [metric, setMetric] = useState<Metric>('b');

  const months = useMemo(() => fiscalMonths(fy, fyStart), [fy, fyStart]);
  const locName = (c: string) => locations.find((l) => l.code === c)?.name ?? c;

  // FY lines with location/type filters (chart + matrix span the whole year); period = + month filter
  const fyLines = useMemo(() => lines.filter((l) => fiscalYearOf(l.d, fyStart) === fy && (!loc || l.loc === loc) && (!type || l.t === type)), [lines, fy, fyStart, loc, type]);
  const period = useMemo(() => (month ? fyLines.filter((l) => l.d.startsWith(month)) : fyLines), [fyLines, month]);
  const total = useMemo(() => sum(period), [period]);

  const byType = useMemo(() => SALE_TYPES.map((t) => ({ key: t, label: t, a: sum(period.filter((l) => l.t === t)) })), [period]);
  const byLoc = useMemo(() => locations.map((l) => ({ key: l.code, label: l.name, a: sum(period.filter((x) => x.loc === l.code)) })), [period, locations]);
  const chart = useMemo(() => months.map((m) => {
    const row: Record<string, string | number> = { month: monthLabel(m) };
    for (const t of SALE_TYPES) row[t] = fyLines.filter((l) => l.t === t && l.d.startsWith(m)).reduce((s, l) => s + l.b, 0);
    return row;
  }), [months, fyLines]);

  // monthly matrix: SKU rows grouped by report group × months
  const matrix = useMemo(() => {
    const cells = new Map<string, Record<string, Agg>>();
    for (const l of fyLines) {
      const r = cells.get(l.sku) ?? {}; const m = l.d.slice(0, 7);
      r[m] = add(r[m] ?? zero(), l); cells.set(l.sku, r);
    }
    const groupOf = (sku: string) => prodMap.get(sku)?.group ?? 'Whiskey';
    const groups = [...REPORT_GROUPS, ...new Set([...cells.keys()].map(groupOf).filter((g) => !(REPORT_GROUPS as readonly string[]).includes(g)))];
    return groups.map((g) => ({
      group: g,
      skus: [...cells.keys()].filter((s) => groupOf(s) === g).sort((a, b) => (prodMap.get(a)?.sort ?? 0) - (prodMap.get(b)?.sort ?? 0)).map((sku) => ({ sku, name: prodMap.get(sku)?.name ?? sku, cells: cells.get(sku)! })),
    })).filter((g) => g.skus.length);
  }, [fyLines, prodMap]);
  const mval = (a: Agg | undefined) => (a ? a[metric] : 0);
  const colTotal = (m: string, skus?: { cells: Record<string, Agg> }[]) =>
    (skus ?? matrix.flatMap((g) => g.skus)).reduce((s, x) => s + mval(x.cells[m]), 0);
  const rowTotal = (cells: Record<string, Agg>) => months.reduce((s, m) => s + mval(cells[m]), 0);

  const topSkus = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const l of period) m.set(l.sku, add(m.get(l.sku) ?? zero(), l));
    return [...m.entries()].sort((a, b) => b[1].p - a[1].p).slice(0, 10);
  }, [period]);

  // ─── exports ───
  const periodLabel = `FY${fy}${month ? ` ${monthLabel(month, true)}` : ''}${loc ? ` ${loc}` : ''}${type ? ` ${type}` : ''}`;
  const fileBase = `bottle-sales-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const aggCells = (a: Agg): Cell[] => [a.b, Math.round(a.c * 10) / 10, { usd: a.p }, { usd: a.w }, { usd: a.r }];
  const AGG_HEAD = ['Bottles', 'Cases', 'Paid to us (DSP)', 'Wholesale value', 'Retail value (MSRP)'];
  function screenTables(): Table[] {
    return [
      { title: `Bottle Sales · ${periodLabel}`, header: ['', ...AGG_HEAD], rows: [['Total', ...aggCells(total)]] },
      { title: 'By Type', header: ['Type', ...AGG_HEAD], rows: [...byType.map((r) => [r.label, ...aggCells(r.a)]), ['Total', ...aggCells(total)]] },
      { title: 'By Location', header: ['Location', ...AGG_HEAD], rows: [...byLoc.map((r) => [r.label, ...aggCells(r.a)]), ['Total', ...aggCells(total)]] },
      {
        title: `Monthly matrix (${METRICS.find((m) => m.key === metric)!.label}) · FY${fy}`,
        header: ['SKU', 'Product', 'Group', ...months.map((m) => monthLabel(m, true)), 'Total'],
        rows: [
          ...matrix.flatMap((g) => g.skus.map((s): Cell[] => [s.sku, s.name, g.group, ...months.map((m) => cellMetric(metric, mval(s.cells[m]))), cellMetric(metric, rowTotal(s.cells))])),
          ['Total', '', '', ...months.map((m) => cellMetric(metric, colTotal(m))), cellMetric(metric, months.reduce((s, m) => s + colTotal(m), 0))],
        ],
      },
      { title: 'Top SKUs', header: ['SKU', 'Product', ...AGG_HEAD], rows: topSkus.map(([sku, a]) => [sku, prodMap.get(sku)?.name ?? sku, ...aggCells(a)]) },
    ];
  }
  function monthEnd() {
    const m = month || [...months].reverse().find((x) => lines.some((l) => l.d.startsWith(x))) || months[0];
    const ls = lines.filter((l) => l.d.startsWith(m)); // all locations and types
    const tl: Cell[][] = [];
    for (const t of SALE_TYPES) for (const lc of locations) {
      const a = sum(ls.filter((l) => l.t === t && l.loc === lc.code));
      if (a.b) tl.push([t, lc.name, ...aggCells(a)]);
    }
    tl.push(['Total', '', ...aggCells(sum(ls))]);
    const bySku = new Map<string, Agg>();
    for (const l of ls) bySku.set(l.sku, add(bySku.get(l.sku) ?? zero(), l));
    const skuRows: Cell[][] = [...bySku.entries()].sort((a, b) => (prodMap.get(a[0])?.sort ?? 0) - (prodMap.get(b[0])?.sort ?? 0))
      .map(([sku, a]) => [sku, prodMap.get(sku)?.name ?? sku, prodMap.get(sku)?.group ?? '', ...aggCells(a)]);
    skuRows.push(['Total', '', '', ...aggCells(sum(ls))]);
    const title = `Month-End Summary · ${monthLabel(m, true)} · all locations`;
    exportXlsx([
      { title, header: ['Type', 'Location', ...AGG_HEAD], rows: tl },
      { title, header: ['SKU', 'Product', 'Group', ...AGG_HEAD], rows: skuRows },
    ], `bottle-sales-month-end-${m}.xlsx`, ['By Type x Location', 'By SKU']);
  }

  const card = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
  const aggTable = (title: string, rows: { key: string; label: string; a: Agg }[]) => (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-3 py-2 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-1.5" /><th className="px-3 py-1.5 text-right">Bottles</th><th className="px-3 py-1.5 text-right">Paid</th><th className="px-3 py-1.5 text-right">Wholesale</th><th className="px-3 py-1.5 text-right">MSRP</th></tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {rows.map((r) => (
              <tr key={r.key}><td className="px-3 py-1.5 font-medium">{r.label}</td><td className="px-3 py-1.5 text-right">{fmtInt(r.a.b)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(r.a.p)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(r.a.w)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(r.a.r)}</td></tr>
            ))}
            <tr className="font-semibold"><td className="px-3 py-1.5">Total</td><td className="px-3 py-1.5 text-right">{fmtInt(total.b)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(total.p)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(total.w)}</td><td className="px-3 py-1.5 text-right">{fmtUsd(total.r)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Fiscal year" value={fy} onChange={(e) => { setFy(Number(e.target.value)); setMonth(''); }} className={selectCls}>
          {fys.map((y) => <option key={y} value={y}>FY{y} ({monthLabel(fiscalMonths(y, fyStart)[0], true)}–{monthLabel(fiscalMonths(y, fyStart)[11], true)})</option>)}
        </select>
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
        </select>
        <select aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} className={selectCls}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
          <option value="">All types</option>
          {SALE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv(screenTables(), `${fileBase}.csv`)}><FileText className="mr-1.5 h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx(screenTables(), `${fileBase}.xlsx`, ['Summary', 'By Type', 'By Location', 'Monthly Matrix', 'Top SKUs'])}><FileSpreadsheet className="mr-1.5 h-4 w-4" />XLSX</Button>
          <Button size="sm" onClick={monthEnd}><Download className="mr-1.5 h-4 w-4" />Month-End Summary</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {card('Bottles', fmtInt(total.b))}
        {card('Cases', fmtCases(total.c), 'bottles ÷ units per case')}
        {card('Paid to us (DSP)', fmtUsd(total.p))}
        {card('Wholesale value', fmtUsd(total.w))}
        {card('Retail value (MSRP)', fmtUsd(total.r))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {aggTable('By Type', byType)}
        {aggTable('By Location', byLoc)}
      </div>

      <section className="rounded-lg border bg-card p-3">
        <h2 className="mb-2 text-sm font-semibold">Bottles by month and type · FY{fy}{loc ? ` · ${locName(loc)}` : ''}</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#ececec" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#898781' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#898781' }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtInt(Number(v))} />
              <Tooltip formatter={(v) => fmtInt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SALE_TYPES.map((t) => <Bar key={t} dataKey={t} stackId="a" fill={TYPE_COLORS[t]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border bg-card" id="monthly-matrix">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Monthly matrix · FY{fy}{loc ? ` · ${locName(loc)}` : ''}{type ? ` · ${type}` : ''}</h2>
          <div className="flex rounded-md border p-0.5" role="tablist">
            {METRICS.map((m) => (
              <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}
                className={cn('rounded px-2.5 py-1 text-xs font-medium', metric === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{m.label}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left">SKU</th>
                {months.map((m) => <th key={m} className={cn('px-2 py-1.5 text-right', month === m && 'bg-amber-50')}>{monthLabel(m)}</th>)}
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((g) => (
                <MatrixGroup key={g.group} group={g.group} skus={g.skus} months={months} month={month} metric={metric}
                  mval={mval} rowTotal={rowTotal} colTotal={colTotal} />
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="sticky left-0 z-10 bg-card px-2 py-1.5">Total</td>
                {months.map((m) => <td key={m} className="px-2 py-1.5 text-right">{fmtMetric(metric, colTotal(m))}</td>)}
                <td className="px-2 py-1.5 text-right">{fmtMetric(metric, months.reduce((s, m) => s + colTotal(m), 0))}</td>
              </tr>
            </tbody>
          </table>
          {matrix.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>}
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">Top SKUs · {periodLabel}</h2>
        <table className="w-full text-sm tabular-nums">
          <tbody className="divide-y">
            {topSkus.map(([sku, a], i) => (
              <tr key={sku}>
                <td className="w-8 px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5"><span className="font-medium">{prodMap.get(sku)?.name ?? sku}</span> <span className="text-xs text-muted-foreground">{sku}</span></td>
                <td className="px-3 py-1.5 text-right">{fmtInt(a.b)} btl</td>
                <td className="px-3 py-1.5 text-right font-semibold">{fmtUsd(a.p)}</td>
              </tr>
            ))}
            {topSkus.length === 0 && <tr><td className="px-3 py-6 text-center text-muted-foreground">No sales in this period.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MatrixGroup({ group, skus, months, month, metric, mval, rowTotal, colTotal }: {
  group: string; skus: { sku: string; name: string; cells: Record<string, Agg> }[]; months: string[]; month: string; metric: Metric;
  mval: (a: Agg | undefined) => number; rowTotal: (c: Record<string, Agg>) => number; colTotal: (m: string, s?: { cells: Record<string, Agg> }[]) => number;
}) {
  return (
    <>
      <tr className="border-t bg-muted/40">
        <td colSpan={months.length + 2} className="sticky left-0 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</td>
      </tr>
      {skus.map((s) => (
        <tr key={s.sku} className="border-t border-muted/60">
          <td className="sticky left-0 z-10 max-w-44 truncate bg-card px-2 py-1" title={`${s.sku} · ${s.name}`}><span className="font-mono text-muted-foreground">{s.sku}</span> {s.name}</td>
          {months.map((m) => { const v = mval(s.cells[m]); return <td key={m} className={cn('px-2 py-1 text-right', !v && 'text-muted-foreground/50', month === m && 'bg-amber-50')}>{v ? fmtMetric(metric, v) : '–'}</td>; })}
          <td className="px-2 py-1 text-right font-medium">{fmtMetric(metric, rowTotal(s.cells))}</td>
        </tr>
      ))}
      <tr className="border-t text-muted-foreground">
        <td className="sticky left-0 z-10 bg-card px-2 py-1 italic">{group} total</td>
        {months.map((m) => <td key={m} className="px-2 py-1 text-right">{fmtMetric(metric, colTotal(m, skus))}</td>)}
        <td className="px-2 py-1 text-right font-medium">{fmtMetric(metric, months.reduce((t, m) => t + colTotal(m, skus), 0))}</td>
      </tr>
    </>
  );
}
