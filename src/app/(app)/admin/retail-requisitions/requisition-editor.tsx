'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Download, Loader2, Mail, Plus, RotateCcw, Save, Search, Share2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { deleteRequisition, getLastRequisition, saveRequisition, sendRequisition } from '@/app/actions/retail-requisitions';
import { formatSalesDate } from '@/lib/wholesale-forms';
import {
  REQ_LOCATIONS,
  REQ_PURPOSES,
  RETAIL_REQ_PATH,
  formatSentDate,
  requisitionFileName,
  type ReqLocation,
  type RetailReqProduct,
  type RetailRequisition,
} from '@/lib/retail-requisitions';

interface CustomRow {
  key: string;
  sku: string;
  description: string;
  qty: string;
  save: boolean;
}

let customKey = 0;
const newCustomRow = (sku = '', description = '', qty = ''): CustomRow => ({ key: `c${++customKey}`, sku, description, qty, save: false });

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 5);
const toQty = (s: string) => (s === '' ? 0 : Number(s));

/** Lines → one quantity per SKU row, and custom rows for anything not on the current list. */
function splitLines(products: RetailReqProduct[], lines: { sku: string; description: string; quantity: number }[]) {
  const bySku = new Map(products.map((p) => [p.sku, p.id]));
  const quantities: Record<string, string> = {};
  const custom: CustomRow[] = [];
  for (const l of lines) {
    const id = bySku.get(l.sku);
    if (id) quantities[id] = String(l.quantity);
    else custom.push(newCustomRow(l.sku, l.description, String(l.quantity)));
  }
  return { quantities, custom };
}

const noSubscribe = () => () => {};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T | null; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-lg border bg-white p-1 gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            'min-h-11 rounded-md px-2 text-sm font-medium transition-colors',
            value === o ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function RequisitionEditor({ products, recipients, isAdmin, today, initial }: {
  products: RetailReqProduct[];
  recipients: string[];
  isAdmin: boolean;
  today: string;
  initial?: RetailRequisition;
}) {
  const router = useRouter();
  const start = useMemo(() => splitLines(products, initial?.lines ?? []), [products, initial]);
  const [location, setLocation] = useState<ReqLocation>(initial?.location ?? 'Grandview');
  const [purpose, setPurpose] = useState<string | null>(initial?.purpose ?? null);
  const [reqDate, setReqDate] = useState(initial?.req_date ?? today);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(start.quantities);
  const [customRows, setCustomRows] = useState<CustomRow[]>(start.custom);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'draft' | 'final' | 'repeat' | 'send' | 'share' | 'delete' | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sentAt, setSentAt] = useState(initial?.sent_at ?? null);

  const id = initial?.id ?? null;
  // A requisition saved with an older purpose keeps showing it; new ones only get the current list.
  const purposeOptions: readonly string[] =
    initial && !(REQ_PURPOSES as readonly string[]).includes(initial.purpose) ? [...REQ_PURPOSES, initial.purpose] : REQ_PURPOSES;
  const isFinal = initial?.status === 'final';

  // Web Share with files (mostly phones); checked after mount so server and client render the same.
  const canShare = useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'form.pdf', { type: 'application/pdf' })] }),
    () => false,
  );

  const filledCustom = customRows.filter((c) => c.sku.trim() || c.description.trim() || c.qty);
  const totalItems =
    products.reduce((sum, p) => sum + toQty(quantities[p.id] ?? ''), 0) + filledCustom.reduce((sum, c) => sum + toQty(c.qty), 0);

  const term = search.trim().toLowerCase();
  const visible = term ? products.filter((p) => p.sku.toLowerCase().includes(term) || p.description.toLowerCase().includes(term)) : products;

  function setCustom(key: string, patch: Partial<CustomRow>) {
    setCustomRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function repeatLast() {
    if (!purpose) return void toast.error('Pick a purpose first.');
    setBusy('repeat');
    try {
      const last = await getLastRequisition(location, purpose, id);
      if (!last) return void toast.info(`No earlier ${location} ${purpose} requisition.`);
      const next = splitLines(products, last.lines);
      setQuantities(next.quantities);
      setCustomRows(next.custom);
      toast.success(`Loaded ${last.lines.length} item${last.lines.length === 1 ? '' : 's'} from ${formatSalesDate(last.req_date)}`);
    } catch {
      toast.error('Couldn’t load the last requisition.');
    } finally {
      setBusy(null);
    }
  }

  async function save(finalize: boolean) {
    if (!purpose) return void toast.error('Pick a purpose first.');
    if (finalize && totalItems === 0) return void toast.error('Add at least one item before finalizing.');
    if (filledCustom.some((c) => !c.sku.trim() || !c.description.trim() || toQty(c.qty) < 1)) {
      return void toast.error('Each added item needs a SKU, description, and quantity (or remove it).');
    }
    setBusy(finalize ? 'final' : 'draft');
    try {
      const res = await saveRequisition({
        id,
        status: finalize || isFinal ? 'final' : 'draft',
        location,
        purpose,
        reqDate,
        notes,
        quantities: Object.fromEntries(products.filter((p) => toQty(quantities[p.id] ?? '') > 0).map((p) => [p.id, toQty(quantities[p.id])])),
        customLines: filledCustom.map((c) => ({ sku: c.sku, description: c.description, quantity: toQty(c.qty), save_to_list: isAdmin && c.save })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(finalize ? 'Requisition finalized' : isFinal ? 'Changes saved' : 'Draft saved');
      if (id) router.refresh();
      else router.replace(`${RETAIL_REQ_PATH}/${res.data.id}`);
    } catch {
      toast.error('Couldn’t save. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!id) return;
    setBusy('send');
    try {
      const res = await sendRequisition(id);
      if (!res.ok) return void toast.error(res.error);
      setSentAt(res.data.sentAt);
      setConfirmSend(false);
      toast.success(`Sent to ${res.data.recipients.join(', ')}`);
      router.refresh();
    } catch {
      toast.error('Couldn’t send it. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!id || !initial) return;
    setBusy('share');
    try {
      const resp = await fetch(`/api/retail-requisitions/${id}/pdf`);
      if (!resp.ok) throw new Error('pdf');
      const file = new File([await resp.blob()], requisitionFileName(initial), { type: 'application/pdf' });
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error('Couldn’t open the share sheet.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!id) return;
    setBusy('delete');
    const res = await deleteRequisition(id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Requisition deleted');
    router.replace(RETAIL_REQ_PATH);
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-36 md:pb-24">
      {isFinal && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 flex flex-wrap items-center gap-3">
          <Check className="h-4 w-4" />
          <span className="flex-1 min-w-40">
            Final.
            {sentAt && <span className="ml-2 font-medium">Sent ✓ {formatSentDate(sentAt)}</span>}
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/retail-requisitions/${id}/pdf`} download><Download className="h-4 w-4 mr-1.5" /> PDF</a>
          </Button>
          <Button size="sm" onClick={() => setConfirmSend(true)} disabled={busy !== null}>
            <Mail className="h-4 w-4 mr-1.5" /> {sentAt ? 'Send again' : 'Send'}
          </Button>
          {canShare && (
            <Button variant="outline" size="sm" onClick={share} disabled={busy !== null}>
              {busy === 'share' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Share2 className="h-4 w-4 mr-1.5" />} Share
            </Button>
          )}
        </div>
      )}

      <Dialog open={confirmSend} onOpenChange={(o) => busy !== 'send' && setConfirmSend(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email this requisition?</DialogTitle>
            <DialogDescription>The PDF will be attached and sent to:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm font-medium">
            {recipients.map((r) => <li key={r} className="font-mono">{r}</li>)}
          </ul>
          {sentAt && <p className="text-xs text-muted-foreground">Already sent {formatSentDate(sentAt)} — this sends it again.</p>}
          {isAdmin && <p className="text-xs text-muted-foreground">Recipients are shared with Wholesale Forms (Wholesale Forms → Settings).</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)} disabled={busy === 'send'}>Cancel</Button>
            <Button onClick={send} disabled={busy === 'send'}>
              {busy === 'send' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(o) => busy !== 'delete' && setConfirmDelete(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this requisition?</DialogTitle>
            <DialogDescription>{location} · {purpose} · {formatSalesDate(reqDate)}. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>Cancel</Button>
            <Button variant="destructive" onClick={remove} disabled={busy === 'delete'}>
              {busy === 'delete' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Location</Label>
          <Segmented label="Location" value={location} options={REQ_LOCATIONS} onChange={setLocation} />
        </div>
        <div className="space-y-1.5">
          <Label>Purpose</Label>
          <Segmented label="Purpose" value={purpose} options={purposeOptions} onChange={setPurpose} />
          {!purpose && <p className="text-xs text-muted-foreground">Required — pick one.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="req-date">Date</Label>
            <Input id="req-date" type="date" value={reqDate} onChange={(e) => e.target.value && setReqDate(e.target.value)} className="h-11 w-44 text-base" />
          </div>
          <Button type="button" variant="outline" onClick={repeatLast} disabled={busy !== null || !purpose} className="h-11">
            {busy === 'repeat' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />} Repeat last
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or description"
              aria-label="Search SKU or description"
              className="h-11 pl-9 pr-10 text-base"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <ul className="divide-y">
          {visible.map((p) => {
            const filled = toQty(quantities[p.id] ?? '') > 0;
            return (
              <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2', filled && 'bg-primary/5')}>
                <label htmlFor={`qty-${p.id}`} className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug">{p.description}</span>
                  <span className="block text-xs font-mono text-muted-foreground">{p.sku}</span>
                </label>
                <Input
                  id={`qty-${p.id}`}
                  value={quantities[p.id] ?? ''}
                  onChange={(e) => setQuantities((q) => ({ ...q, [p.id]: digits(e.target.value) }))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="0"
                  aria-label={`Quantity of ${p.description}`}
                  className={cn('h-12 w-20 shrink-0 text-center text-lg font-semibold tabular-nums', filled && 'border-primary')}
                />
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No SKU matches “{search}”.</li>}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-3">
        {customRows.map((c) => (
          <div key={c.key} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-end gap-2">
              <div className="w-28 space-y-1">
                <Label htmlFor={`${c.key}-sku`} className="text-xs">SKU</Label>
                <Input id={`${c.key}-sku`} value={c.sku} onChange={(e) => setCustom(c.key, { sku: e.target.value.toUpperCase() })} className="h-11 text-base font-mono" />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`${c.key}-qty`} className="text-xs"># Items</Label>
                <Input id={`${c.key}-qty`} value={c.qty} onChange={(e) => setCustom(c.key, { qty: digits(e.target.value) })} inputMode="numeric" pattern="[0-9]*" className="h-11 text-center text-base font-semibold" />
              </div>
              <div className="flex-1" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setCustomRows((rows) => rows.filter((r) => r.key !== c.key))} className="h-11 w-11" aria-label="Remove item">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${c.key}-desc`} className="text-xs">Description</Label>
              <Input id={`${c.key}-desc`} value={c.description} onChange={(e) => setCustom(c.key, { description: e.target.value })} className="h-11 text-base" />
            </div>
            {isAdmin && (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={c.save} onChange={(e) => setCustom(c.key, { save: e.target.checked })} className="h-4 w-4" />
                Save to list
              </label>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setCustomRows((rows) => [...rows, newCustomRow()])} className="h-11">
          <Plus className="h-4 w-4 mr-1.5" /> Add item
        </Button>
      </section>

      <section className="rounded-xl border bg-card p-4 space-y-1.5">
        <Label htmlFor="req-notes">Notes <span className="text-muted-foreground font-normal">(internal, not printed)</span></Label>
        <Textarea id="req-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </section>

      {/* Sticky total + actions */}
      <div className="fixed bottom-[var(--mobile-nav-h)] md:bottom-0 left-0 md:left-56 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2">
          <div className="mr-auto">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Total items</p>
            <p data-total-items className="text-2xl font-serif font-bold tabular-nums leading-tight">{totalItems}</p>
          </div>
          {id && (!isFinal || isAdmin) && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy !== null} className="h-11 px-3 text-red-700" title="Delete requisition">
              <Trash2 className="h-4 w-4" /><span className="sr-only">Delete requisition</span>
            </Button>
          )}
          {isFinal ? (
            <Button onClick={() => save(false)} disabled={busy !== null} className="h-11">
              {busy === 'draft' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save changes
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => save(false)} disabled={busy !== null} className="h-11">
                {busy === 'draft' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Save<span className="hidden sm:inline">&nbsp;Draft</span>
              </Button>
              <Button onClick={() => save(true)} disabled={busy !== null} className="h-11">
                {busy === 'final' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />} Finalize
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
