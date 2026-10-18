'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, GitMerge, Link2, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  mergeCustomers,
  saveCustomer,
  searchCrmAccounts,
  setCustomerArchived,
  type CustomerInput,
} from '@/app/actions/wholesale-forms';
import { formatSalesDate, type WholesaleCustomer } from '@/lib/wholesale-forms';
import { cn } from '@/lib/utils';

const EMPTY: CustomerInput = {
  name: '', address_line1: '', city: '', state: 'OH', zip: '', phone: '', account_type: 'wholesale',
  account_number: '', customer_id_number: '', crm_account_id: null, notes: '',
};

export function WholesalersClient({ customers }: { customers: WholesaleCustomer[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<WholesaleCustomer | 'new' | null>(null);
  const [merging, setMerging] = useState<WholesaleCustomer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers
      .filter((c) => showArchived || !c.archived)
      .filter((c) => !term || [c.name, c.account_number, c.city, c.phone].some((v) => v?.toLowerCase().includes(term)));
  }, [customers, q, showArchived]);

  async function toggleArchived(c: WholesaleCustomer) {
    setBusyId(c.id);
    const res = await setCustomerArchived(c.id, !c.archived);
    setBusyId(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(c.archived ? `${c.name} restored` : `${c.name} archived`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, account #, city, phone" className="h-9 pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[#C8102E]" />
          Show archived
        </label>
        <Button size="sm" className="h-9" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4 mr-1.5" /> Add wholesaler
        </Button>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2.5">Wholesaler</th>
              <th className="text-left font-medium px-3 py-2.5">Account #</th>
              <th className="text-left font-medium px-3 py-2.5">Type</th>
              <th className="text-left font-medium px-3 py-2.5">CRM account</th>
              <th className="text-right font-medium px-3 py-2.5">Orders</th>
              <th className="text-left font-medium px-3 py-2.5">Last order</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                {customers.length === 0 ? 'No wholesalers yet — they’re added automatically when you save a form, or add one here.' : 'No wholesalers match.'}
              </td></tr>
            )}
            {visible.map((c) => (
              <tr key={c.id} className={cn(c.archived && 'opacity-60')}>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{c.name}{c.archived && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">Archived</span>}</p>
                  <p className="text-xs text-muted-foreground">{[c.address_line1, [c.city, c.state].filter(Boolean).join(', '), c.zip].filter(Boolean).join(' · ') || '—'}{c.phone ? ` · ${c.phone}` : ''}</p>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{c.account_number ?? '—'}</td>
                <td className="px-3 py-2.5 capitalize">{c.account_type}</td>
                <td className="px-3 py-2.5 text-xs">{c.crm_account_name ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.times_used}</td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{c.last_order_date ? formatSalesDate(c.last_order_date) : '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="Edit" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title="Merge a duplicate into this wholesaler" onClick={() => setMerging(c)} disabled={customers.length < 2}><GitMerge className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" title={c.archived ? 'Restore' : 'Archive'} onClick={() => toggleArchived(c)} disabled={busyId === c.id}>
                      {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CustomerDialog
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {merging && (
        <MergeDialog
          keep={merging}
          candidates={customers.filter((c) => c.id !== merging.id)}
          onClose={() => setMerging(null)}
          onMerged={() => { setMerging(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CustomerDialog({ customer, onClose, onSaved }: { customer: WholesaleCustomer | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerInput>(() => customer ? {
    name: customer.name, address_line1: customer.address_line1 ?? '', city: customer.city ?? '', state: customer.state,
    zip: customer.zip ?? '', phone: customer.phone ?? '', account_type: customer.account_type,
    account_number: customer.account_number ?? '', customer_id_number: customer.customer_id_number ?? '',
    crm_account_id: customer.crm_account_id, notes: customer.notes ?? '',
  } : EMPTY);
  const [crmName, setCrmName] = useState<string | null>(customer?.crm_account_name ?? null);
  const [crmQuery, setCrmQuery] = useState('');
  const [crmResults, setCrmResults] = useState<{ id: string; display_name: string; city: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CustomerInput>(k: K, v: CustomerInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (crmQuery.trim().length < 2) return;
    const t = setTimeout(async () => setCrmResults(await searchCrmAccounts(crmQuery)), 250);
    return () => clearTimeout(t);
  }, [crmQuery]);

  async function submit() {
    setSaving(true);
    const res = await saveCustomer(customer?.id ?? null, form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(customer ? 'Wholesaler updated' : 'Wholesaler added');
    onSaved();
  }

  const field = (label: string, key: keyof CustomerInput, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`c-${key}`}>{label}</Label>
      <Input id={`c-${key}`} value={(form[key] as string) ?? ''} onChange={(e) => set(key, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{customer ? 'Edit wholesaler' : 'Add wholesaler'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {field('Name', 'name')}
          {field('Address', 'address_line1')}
          <div className="grid grid-cols-[1fr_64px_96px] gap-2">
            {field('City', 'city')}
            {field('State', 'state', { maxLength: 2 })}
            {field('ZIP', 'zip', { inputMode: 'numeric' })}
          </div>
          {field('Phone', 'phone', { inputMode: 'tel' })}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex rounded-lg border overflow-hidden h-9 w-fit">
              {(['wholesale', 'transient'] as const).map((t) => (
                <button key={t} type="button" onClick={() => set('account_type', t)}
                  className={cn('px-4 text-sm font-medium capitalize', form.account_type === t ? 'bg-primary text-white' : 'bg-white text-muted-foreground')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field('Account #', 'account_number', { placeholder: '10006967-1' })}
            {field('Customer ID#', 'customer_id_number')}
          </div>
          <div className="space-y-1.5">
            <Label>CRM account <span className="text-muted-foreground font-normal">(optional)</span></Label>
            {form.crm_account_id ? (
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{crmName ?? 'Linked account'}</span>
                <button type="button" onClick={() => { set('crm_account_id', null); setCrmName(null); }} className="text-muted-foreground" aria-label="Unlink"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="relative">
                <Input value={crmQuery} onChange={(e) => setCrmQuery(e.target.value)} placeholder="Search CRM accounts…" />
                {crmQuery.trim().length >= 2 && crmResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
                    {crmResults.map((a) => (
                      <button key={a.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { set('crm_account_id', a.id); setCrmName(a.display_name); setCrmQuery(''); setCrmResults([]); }}>
                        {a.display_name}{a.city && <span className="ml-1.5 text-xs text-muted-foreground">{a.city}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-notes">Notes</Label>
            <Textarea id="c-notes" rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.name.trim()}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ keep, candidates, onClose, onMerged }: { keep: WholesaleCustomer; candidates: WholesaleCustomer[]; onClose: () => void; onMerged: () => void }) {
  const [dupId, setDupId] = useState('');
  const [saving, setSaving] = useState(false);
  const dup = candidates.find((c) => c.id === dupId);

  async function submit() {
    if (!dup) return;
    if (!window.confirm(`Merge “${dup.name}” into “${keep.name}”? Its ${dup.times_used} form(s) move to ${keep.name} and the duplicate is removed.`)) return;
    setSaving(true);
    const res = await mergeCustomers(keep.id, dup.id);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Merged into ${keep.name}`);
    onMerged();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Merge duplicate into {keep.name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          The duplicate’s forms move to <span className="font-medium text-foreground">{keep.name}</span>. Blank fields on {keep.name} are filled from the duplicate; past forms keep their printed details.
        </p>
        <select value={dupId} onChange={(e) => setDupId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
          <option value="">Choose the duplicate…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.account_number ? ` · ${c.account_number}` : ''}{c.city ? ` · ${c.city}` : ''}</option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!dup || saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Merge</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
