'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, FileCheck2, Loader2, Paperclip, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { attachSignedCopy, getSignedCopyUrl } from '@/app/actions/wholesale-forms';
import {
  WHOLESALE_BUCKET,
  WHOLESALE_FORMS_PATH,
  formatCents,
  formatSalesDate,
  type WholesaleForm,
} from '@/lib/wholesale-forms';
import { cn } from '@/lib/utils';

type HistoryForm = Omit<WholesaleForm, 'lines'>;

function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Integer cents → "784.90" for spreadsheets (no float math). */
function centsPlain(c: number): string {
  return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

export function HistoryClient({ forms, customers }: { forms: HistoryForm[]; customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [q, setQ] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return forms.filter((f) => {
      if (from && f.sales_date < from) return false;
      if (to && f.sales_date > to) return false;
      if (customer && f.customer_id !== customer) return false;
      if (term && ![f.recipient_name, f.account_number, f.recipient_city, f.notes].some((v) => v?.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [forms, from, to, customer, q]);

  const totals = filtered.filter((f) => f.status === 'final').reduce(
    (acc, f) => ({ bottles: acc.bottles + f.total_bottles, cents: acc.cents + f.receipt_total_cents }),
    { bottles: 0, cents: 0 },
  );

  function exportCsv() {
    const header = ['Sales Date', 'Recipient', 'Account #', 'Customer ID#', 'Type', 'City', 'Bottles', 'Receipt Total', 'Status', 'Signed Copy', 'Notes'];
    const rows = filtered.map((f) => [
      f.sales_date, f.recipient_name, f.account_number, f.customer_id_number, f.account_type, f.recipient_city,
      f.total_bottles, centsPlain(f.receipt_total_cents), f.status, f.signed_copy_path ? 'Yes' : 'No', f.notes,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `wholesale-forms${from ? `-${from}` : ''}${to ? `-to-${to}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function pickSignedCopy(formId: string) {
    uploadTarget.current = formId;
    fileRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    const formId = uploadTarget.current;
    if (!file || !formId) return;
    setUploadingId(formId);
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'pdf';
      const path = `forms/${formId}/signed-${Date.now()}.${ext}`;
      const { error } = await createClient().storage.from(WHOLESALE_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      const res = await attachSignedCopy(formId, path);
      if (!res.ok) throw new Error(res.error);
      toast.success('Signed copy attached');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingId(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function viewSignedCopy(formId: string) {
    const url = await getSignedCopyUrl(formId);
    if (url) window.open(url, '_blank', 'noopener');
    else toast.error('Couldn’t open the signed copy.');
  }

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">From</label>
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">To</label>
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Wholesaler</label>
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm max-w-[220px]">
            <option value="">All wholesalers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient, account #, city" className="h-9 pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0} className="h-9">
          <Download className="h-4 w-4 mr-1.5" /> CSV
        </Button>
        <Button asChild size="sm" className="h-9">
          <Link href={`${WHOLESALE_FORMS_PATH}/new`}><Plus className="h-4 w-4 mr-1.5" /> New Form</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2.5">Date</th>
              <th className="text-left font-medium px-3 py-2.5">Recipient</th>
              <th className="text-left font-medium px-3 py-2.5">Account #</th>
              <th className="text-right font-medium px-3 py-2.5">Bottles</th>
              <th className="text-right font-medium px-3 py-2.5">Total</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-right font-medium px-3 py-2.5">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                {forms.length === 0 ? 'No wholesale forms yet.' : 'No forms match these filters.'}
              </td></tr>
            )}
            {filtered.map((f) => (
              <tr key={f.id} onClick={() => router.push(`${WHOLESALE_FORMS_PATH}/${f.id}`)} className="cursor-pointer hover:bg-muted/40">
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatSalesDate(f.sales_date)}</td>
                <td className="px-3 py-2.5 font-medium">{f.recipient_name ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{f.account_number ?? '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{f.total_bottles}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">{formatCents(f.receipt_total_cents)}</td>
                <td className="px-3 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', f.status === 'final' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200')}>
                    {f.status === 'final' ? 'Final' : 'Draft'}
                  </span>
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end items-center gap-1">
                    <Button asChild variant="ghost" size="sm" className="h-8 px-2" title="Download PDF">
                      <a href={`/api/wholesale-forms/${f.id}/pdf`} download><Download className="h-4 w-4" /><span className="sr-only">PDF</span></a>
                    </Button>
                    {f.signed_copy_path ? (
                      <Button variant="ghost" size="sm" className="h-8 px-2 text-green-700" title="View signed copy" onClick={() => viewSignedCopy(f.id)}>
                        <FileCheck2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="h-8 px-2" title={f.signed_copy_path ? 'Replace signed copy' : 'Attach signed copy'} onClick={() => pickSignedCopy(f.id)} disabled={uploadingId === f.id}>
                      {uploadingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t text-xs text-muted-foreground">
                <td colSpan={3} className="px-3 py-2.5">{filtered.length} form{filtered.length === 1 ? '' : 's'} · finalized totals</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.bottles}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">{formatCents(totals.cents)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
