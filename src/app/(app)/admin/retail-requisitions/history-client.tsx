'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, FileCheck2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatSalesDate } from '@/lib/wholesale-forms';
import {
  REQ_LOCATIONS,
  REQ_PURPOSES,
  RETAIL_REQ_PATH,
  formatSentDate,
  type RetailRequisitionSummary,
} from '@/lib/retail-requisitions';

function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function HistoryClient({ requisitions }: { requisitions: RetailRequisitionSummary[] }) {
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filtered = useMemo(
    () =>
      requisitions.filter((r) => {
        if (location && r.location !== location) return false;
        if (purpose && r.purpose !== purpose) return false;
        if (from && r.req_date < from) return false;
        if (to && r.req_date > to) return false;
        return true;
      }),
    [requisitions, location, purpose, from, to],
  );

  function exportCsv() {
    const header = ['Date', 'Location', 'Purpose', 'Items', 'Requested By', 'Status', 'Last Sent', 'Sent To', 'Notes'];
    const rows = filtered.map((r) => [
      r.req_date, r.location, r.purpose, r.total_items, r.requested_by_name, r.status, r.sent_at ?? '', (r.sent_to ?? []).join('; '), r.notes,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `retail-requisitions${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const selectCls = 'h-9 rounded-md border bg-white px-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="f-location" className="text-[11px] uppercase tracking-wider text-muted-foreground">Location</label>
          <select id="f-location" value={location} onChange={(e) => setLocation(e.target.value)} className={`${selectCls} block`}>
            <option value="">All</option>
            {REQ_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-purpose" className="text-[11px] uppercase tracking-wider text-muted-foreground">Purpose</label>
          <select id="f-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={`${selectCls} block`}>
            <option value="">All</option>
            {REQ_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="f-from" className="text-[11px] uppercase tracking-wider text-muted-foreground">From</label>
          <Input id="f-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="f-to" className="text-[11px] uppercase tracking-wider text-muted-foreground">To</label>
          <Input id="f-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0} className="h-9 sm:ml-auto">
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
        <Button asChild size="sm" className="h-9">
          <Link href={`${RETAIL_REQ_PATH}/new`}><Plus className="h-4 w-4 mr-1.5" /> New Requisition</Link>
        </Button>
      </div>

      <div className="relative rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2.5">Date</th>
              <th className="text-left font-medium px-3 py-2.5">Location</th>
              <th className="text-left font-medium px-3 py-2.5">Purpose</th>
              <th className="text-right font-medium px-3 py-2.5">Items</th>
              <th className="text-left font-medium px-3 py-2.5">Requested by</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-right font-medium px-3 py-2.5">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Link href={`${RETAIL_REQ_PATH}/${r.id}`} className="font-medium text-primary hover:underline">{formatSalesDate(r.req_date)}</Link>
                </td>
                <td className="px-3 py-2.5">{r.location}</td>
                <td className="px-3 py-2.5">{r.purpose}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.total_items}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{r.requested_by_name ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {r.sent_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[11px] font-medium text-green-800">
                      <FileCheck2 className="h-3 w-3" /> Sent ✓ {formatSentDate(r.sent_at)}
                    </span>
                  ) : (
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{r.status === 'final' ? 'Final' : 'Draft'}</span>
                  )}
                </td>
                <td className="px-1 py-1 text-right">
                  <Button asChild variant="ghost" size="icon" className="h-11 w-11">
                    <a href={`/api/retail-requisitions/${r.id}/pdf`} download>
                      <Download className="h-4 w-4" /><span className="sr-only">Download PDF</span>
                    </a>
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No requisitions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
