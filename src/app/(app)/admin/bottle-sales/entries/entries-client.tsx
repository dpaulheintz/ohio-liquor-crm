'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { BOTTLE_SALES_PATH, SALE_TYPES, fiscalMonths, fiscalYearOf, fmtInt, fmtUsd, monthLabel, type BottleLocation } from '@/lib/bottle-sales';

export interface EntrySummary {
  entry_id: string;
  sale_date: string;
  location_code: string;
  type: string;
  bottles: number;
  paid_c: number;
  wholesale_c: number;
  skus: string[];
  search: string;
  source: string;
  notes: string | null;
}

const selectCls = 'h-10 rounded-md border bg-background px-2 text-sm';

export function EntriesClient({ entries, locations, fyStart }: { entries: EntrySummary[]; locations: BottleLocation[]; fyStart: number }) {
  const fys = useMemo(() => [...new Set(entries.map((e) => fiscalYearOf(e.sale_date, fyStart)))].sort((a, b) => b - a), [entries, fyStart]);
  const [fy, setFy] = useState<string>(fys[0] ? String(fys[0]) : '');
  const [month, setMonth] = useState('');
  const [loc, setLoc] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) =>
      (!fy || fiscalYearOf(e.sale_date, fyStart) === Number(fy)) &&
      (!month || e.sale_date.startsWith(month)) &&
      (!loc || e.location_code === loc) && (!type || e.type === type) &&
      (!needle || e.search.includes(needle) || e.sale_date.includes(needle)));
  }, [entries, fy, month, loc, type, q, fyStart]);
  const tot = rows.reduce((a, e) => ({ b: a.b + e.bottles, p: a.p + e.paid_c }), { b: 0, p: 0 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Fiscal year" value={fy} onChange={(e) => { setFy(e.target.value); setMonth(''); }} className={selectCls}>
          <option value="">All years</option>
          {fys.map((y) => <option key={y} value={y}>FY{y}</option>)}
        </select>
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls} disabled={!fy}>
          <option value="">All months</option>
          {fy && fiscalMonths(Number(fy), fyStart).map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
        </select>
        <select aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} className={selectCls}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
          <option value="">All types</option>
          {SALE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, product, note or date" className="h-10 pl-9" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{fmtInt(rows.length)} entries · {fmtInt(tot.b)} bottles · {fmtUsd(tot.p)} paid</p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Type</th>
              <th className="hidden px-3 py-2 sm:table-cell">SKUs</th>
              <th className="px-3 py-2 text-right">Bottles</th><th className="px-3 py-2 text-right">Paid $</th><th className="w-6" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.slice(0, 500).map((e) => (
              <tr key={e.entry_id} className="hover:bg-muted/40">
                <td className="whitespace-nowrap px-3 py-2"><Link href={`${BOTTLE_SALES_PATH}/entries/${e.entry_id}`} className="font-medium hover:underline">{e.sale_date}</Link></td>
                <td className="px-3 py-2">{e.location_code}</td>
                <td className="px-3 py-2">{e.type}</td>
                <td className="hidden max-w-xs truncate px-3 py-2 text-muted-foreground sm:table-cell">{e.skus.join(', ')}{e.notes ? ` · ${e.notes}` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtInt(e.bottles)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(e.paid_c)}</td>
                <td className="pr-2"><Link href={`${BOTTLE_SALES_PATH}/entries/${e.entry_id}`} aria-label="Open entry"><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No entries match.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 500 && <p className="text-xs text-muted-foreground">Showing the latest 500. Narrow the filters to see older entries.</p>}
    </div>
  );
}
