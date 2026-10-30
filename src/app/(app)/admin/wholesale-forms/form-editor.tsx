'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Download, History, Loader2, Mail, Plus, RotateCcw, Save, Share2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { deleteWholesaleForm, getLastOrderQuantities, saveWholesaleForm, sendWholesaleForm, type CustomerInput } from '@/app/actions/wholesale-forms';
import {
  WHOLESALE_FORMS_PATH,
  formatCents,
  parseDollarsToCents,
  parseQuantity,
  pdfFileName,
  type AccountType,
  type WholesaleCustomer,
  type WholesaleForm,
  type WholesaleWarehouse,
} from '@/lib/wholesale-forms';

export interface ProductRow {
  productId: string;
  brand_code: string;
  description: string;
  unit_type: string;
  price_cents: number;
}

interface Props {
  rows: ProductRow[];
  customers: WholesaleCustomer[];
  warehouses: WholesaleWarehouse[];
  recipients: string[];
  isAdmin: boolean;
  today: string;
  initial?: WholesaleForm;
}

interface CustomRow {
  key: string;
  brand_code: string;
  description: string;
  unit_type: string;
  price: string;
  qty: string;
  save: boolean;
}

let customKey = 0;
const newCustomRow = (): CustomRow => ({ key: `c${++customKey}`, brand_code: '', description: '', unit_type: 'Bottles', price: '', qty: '', save: false });

function centsInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'America/New_York' });
}

const EMPTY_RECIPIENT: CustomerInput = {
  name: '', address_line1: '', city: '', state: 'OH', zip: '', phone: '',
  account_type: 'wholesale', account_number: '', customer_id_number: '',
};

function fromCustomer(c: WholesaleCustomer): CustomerInput {
  return {
    name: c.name,
    address_line1: c.address_line1 ?? '',
    city: c.city ?? '',
    state: c.state || 'OH',
    zip: c.zip ?? '',
    phone: c.phone ?? '',
    account_type: c.account_type,
    account_number: c.account_number ?? '',
    customer_id_number: c.customer_id_number ?? '',
  };
}

function fromForm(f: WholesaleForm): CustomerInput {
  return {
    name: f.recipient_name ?? '',
    address_line1: f.recipient_address_line1 ?? '',
    city: f.recipient_city ?? '',
    state: f.recipient_state || 'OH',
    zip: f.recipient_zip ?? '',
    phone: f.recipient_phone ?? '',
    account_type: (f.account_type ?? 'wholesale') as AccountType,
    account_number: f.account_number ?? '',
    customer_id_number: f.customer_id_number ?? '',
  };
}

const RECIPIENT_KEYS: (keyof CustomerInput)[] = ['name', 'address_line1', 'city', 'state', 'zip', 'phone', 'account_type', 'account_number', 'customer_id_number'];

export function FormEditor({ rows, customers, warehouses, recipients, isAdmin, today, initial }: Props) {
  const router = useRouter();
  const defaultWarehouse = warehouses.find((w) => w.is_default) ?? warehouses[0];
  const [formId, setFormId] = useState<string | null>(initial?.id ?? null);
  const [warehouseId, setWarehouseId] = useState<string | null>(initial?.warehouse_id ?? defaultWarehouse?.id ?? null);
  const [warehouseAutoSet, setWarehouseAutoSet] = useState(false);
  const [customRows, setCustomRows] = useState<CustomRow[]>(() =>
    (initial?.lines ?? []).filter((l) => !l.product_id).map((l) => ({
      key: `c${++customKey}`, brand_code: l.brand_code, description: l.description, unit_type: l.unit_type,
      price: centsInput(l.price_cents), qty: String(l.quantity), save: false,
    })),
  );
  const [lastSentAt, setLastSentAt] = useState<string | null>(initial?.last_sent_at ?? null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Web Share with files (mostly phones); checked after mount so server and client render the same.
  const canShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'form.pdf', { type: 'application/pdf' })] }),
    () => false,
  );
  const [isFinal, setIsFinal] = useState(initial?.status === 'final');
  const [salesDate, setSalesDate] = useState(initial?.sales_date ?? today);
  const [customerId, setCustomerId] = useState<string | null>(initial?.customer_id ?? null);
  const [recipient, setRecipient] = useState<CustomerInput>(initial ? fromForm(initial) : EMPTY_RECIPIENT);
  // "Edited" is measured against what this form loaded with, so reopening an old form never
  // pushes its older snapshot back into the directory unless the user changes something.
  const [baseline, setBaseline] = useState<CustomerInput | null>(() => (initial?.customer_id ? fromForm(initial) : null));
  const [isNewWholesaler, setIsNewWholesaler] = useState(false);
  const [updateSaved, setUpdateSaved] = useState(true);
  const [customerIdTouched, setCustomerIdTouched] = useState(
    !!initial && (initial.customer_id_number ?? '') !== (initial.account_number ?? ''),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.lines ?? []).filter((l) => l.product_id && l.quantity > 0).map((l) => [l.product_id!, String(l.quantity)])),
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<null | 'draft' | 'final' | 'repeat' | 'send' | 'share' | 'delete'>(null);

  const selected = customers.find((c) => c.id === customerId) ?? null;
  const showFields = !!customerId || isNewWholesaler || !!recipient.name;
  const edited = !!baseline && RECIPIENT_KEYS.some((k) => (recipient[k] ?? '') !== (baseline[k] ?? ''));

  // ── Totals (integer cents) ────────────────────────────────────────────────
  const lineState = rows.map((r) => {
    const raw = quantities[r.productId] ?? '';
    const qty = parseQuantity(raw);
    return { ...r, raw, qty, invalid: qty === null, lineCents: qty ? r.price_cents * qty : 0 };
  });
  const customState = customRows.map((c) => {
    const qty = parseQuantity(c.qty);
    const price = c.price.trim() === '' ? null : parseDollarsToCents(c.price);
    const incomplete = !c.brand_code.trim() || !c.description.trim() || price === null;
    return { ...c, qtyN: qty, priceCents: price, invalidQty: qty === null, invalidPrice: c.price.trim() !== '' && price === null, incomplete, lineCents: qty && price !== null ? price * qty : 0 };
  });
  const totalBottles = lineState.reduce((s, l) => s + (l.qty ?? 0), 0) + customState.reduce((s, c) => s + (c.qtyN ?? 0), 0);
  const totalCents = lineState.reduce((s, l) => s + l.lineCents, 0) + customState.reduce((s, c) => s + c.lineCents, 0);
  const anyInvalid = lineState.some((l) => l.invalid) || customState.some((c) => c.invalidQty || c.invalidPrice);
  const canFinalize = !!recipient.name.trim() && totalBottles > 0 && !anyInvalid;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.account_number, c.city].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [customers, search]);

  function setField<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setRecipient((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'account_number' && !customerIdTouched) next.customer_id_number = value as string;
      return next;
    });
  }

  function pickCustomer(c: WholesaleCustomer) {
    const r = fromCustomer(c);
    setCustomerId(c.id);
    // Finalized forms keep the warehouse they were issued from.
    if (!isFinal && c.default_warehouse_id) {
      setWarehouseId(c.default_warehouse_id);
      setWarehouseAutoSet(true);
    }
    setRecipient(r);
    setBaseline(r);
    setIsNewWholesaler(false);
    setUpdateSaved(true);
    setCustomerIdTouched(r.customer_id_number !== r.account_number);
    setPickerOpen(false);
    setSearch('');
  }

  function startNewWholesaler() {
    setCustomerId(null);
    if (!isFinal) {
      setWarehouseId(defaultWarehouse?.id ?? null);
      setWarehouseAutoSet(false);
    }
    setBaseline(null);
    setRecipient({ ...EMPTY_RECIPIENT, name: search.trim() });
    setIsNewWholesaler(true);
    setCustomerIdTouched(false);
    setPickerOpen(false);
    setSearch('');
  }

  async function repeatLastOrder() {
    if (!customerId) return;
    setBusy('repeat');
    try {
      const last = await getLastOrderQuantities(customerId, formId);
      const known = rows.filter((r) => last[r.productId]);
      if (known.length === 0) {
        toast.info('No previous quantities found for this wholesaler.');
        return;
      }
      setQuantities(Object.fromEntries(known.map((r) => [r.productId, String(last[r.productId])])));
      toast.success(`Copied ${known.length} item${known.length === 1 ? '' : 's'} from their last order`);
    } catch {
      toast.error('Couldn’t load the last order.');
    } finally {
      setBusy(null);
    }
  }

  async function save(finalize: boolean) {
    if (anyInvalid) {
      toast.error('Quantities must be whole numbers.');
      return;
    }
    if (finalize && !canFinalize) {
      toast.error(!recipient.name.trim() ? 'Choose or add a recipient first.' : 'Enter at least one bottle first.');
      return;
    }
    const incomplete = customState.find((c) => c.incomplete);
    if (incomplete) {
      toast.error('Each added item needs a brand code, description, and price (or remove it).');
      return;
    }
    setBusy(finalize ? 'final' : 'draft');
    try {
      const res = await saveWholesaleForm({
        formId,
        status: finalize || isFinal ? 'final' : 'draft',
        salesDate,
        customerId,
        recipient,
        saveToDirectory: !!customerId && edited && updateSaved,
        quantities: Object.fromEntries(lineState.filter((l) => (l.qty ?? 0) > 0).map((l) => [l.productId, l.qty!])),
        customLines: customState.map((c) => ({
          brand_code: c.brand_code, description: c.description, unit_type: c.unit_type || 'Bottles',
          price_cents: c.priceCents!, quantity: c.qtyN ?? 0, save_to_price_list: isAdmin && c.save,
        })),
        warehouseId,
        notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, customerId: savedCustomerId, warning } = res.data;
      if (warning) toast.warning(warning);
      setCustomRows((rows) => rows.map((r) => ({ ...r, save: false })));
      setFormId(id);
      setCustomerId(savedCustomerId);
      setIsNewWholesaler(false);
      setBaseline(recipient);
      if (finalize || isFinal) {
        setIsFinal(true);
        downloadPdf(id);
        toast.success(isFinal && !finalize ? 'Form updated — PDF regenerated' : 'Form finalized');
      } else {
        toast.success('Draft saved');
      }
      if (!formId || finalize) router.replace(`${WHOLESALE_FORMS_PATH}/${id}`);
      router.refresh();
    } catch {
      toast.error('Couldn’t save the form. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  function downloadPdf(id: string) {
    const a = document.createElement('a');
    a.href = `/api/wholesale-forms/${id}/pdf`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function send() {
    if (!formId) return;
    setBusy('send');
    try {
      const res = await sendWholesaleForm(formId);
      if (!res.ok) return void toast.error(res.error);
      setLastSentAt(res.data.sentAt);
      setConfirmSend(false);
      toast.success(`Sent to ${res.data.recipients.join(', ')}`);
      router.refresh();
    } catch {
      toast.error('Couldn’t send the form. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    if (!formId) return;
    setBusy('share');
    try {
      const resp = await fetch(`/api/wholesale-forms/${formId}/pdf`);
      if (!resp.ok) throw new Error('pdf');
      const file = new File([await resp.blob()], pdfFileName(salesDate, recipient.name || null), { type: 'application/pdf' });
      await navigator.share({ files: [file], title: file.name });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast.error('Couldn’t open the share sheet.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!formId) return;
    setBusy('delete');
    const res = await deleteWholesaleForm(formId);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Form deleted');
    router.replace(WHOLESALE_FORMS_PATH);
    router.refresh();
  }

  function setCustom(key: string, patch: Partial<CustomRow>) {
    setCustomRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const inputCls = 'h-11 text-base';

  return (
    <div className="space-y-6 pb-28">
      {isFinal && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 flex flex-wrap items-center gap-3">
          <Check className="h-4 w-4" />
          <span className="flex-1">
            This form is final. Saving changes regenerates its PDF.
            {lastSentAt && <span className="ml-2 font-medium">Sent ✓ {formatSentAt(lastSentAt)}</span>}
          </span>
          {formId && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadPdf(formId)}>
                <Download className="h-4 w-4 mr-1.5" /> Download PDF
              </Button>
              <Button size="sm" onClick={() => setConfirmSend(true)} disabled={busy !== null}>
                <Mail className="h-4 w-4 mr-1.5" /> {lastSentAt ? 'Send again' : 'Send'}
              </Button>
              {canShare && (
                <Button variant="outline" size="sm" onClick={share} disabled={busy !== null}>
                  {busy === 'share' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Share2 className="h-4 w-4 mr-1.5" />} Share
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={confirmSend} onOpenChange={(o) => busy !== 'send' && setConfirmSend(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email this form?</DialogTitle>
            <DialogDescription>The PDF will be attached and sent to:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm font-medium">
            {recipients.map((r) => <li key={r} className="font-mono">{r}</li>)}
          </ul>
          {lastSentAt && <p className="text-xs text-muted-foreground">Already sent {formatSentAt(lastSentAt)} — this sends it again.</p>}
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
            <DialogTitle>Delete this form?</DialogTitle>
            <DialogDescription>
              {recipient.name || 'This form'} · {formatCents(totalCents)}. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy === 'delete'}>Cancel</Button>
            <Button variant="destructive" onClick={remove} disabled={busy === 'delete'}>
              {busy === 'delete' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* From warehouse */}
      <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-2">
        <Label>From Warehouse</Label>
        <div className="flex flex-wrap rounded-lg border overflow-hidden w-fit" role="radiogroup" aria-label="From warehouse">
          {warehouses.map((wh) => (
            <button
              key={wh.id}
              type="button"
              role="radio"
              aria-checked={warehouseId === wh.id}
              disabled={!isAdmin}
              onClick={() => { setWarehouseId(wh.id); setWarehouseAutoSet(false); }}
              className={cn('h-11 px-4 text-sm font-medium', warehouseId === wh.id ? 'bg-primary text-white' : 'bg-white text-muted-foreground', isAdmin && warehouseId !== wh.id && 'hover:text-foreground', !isAdmin && 'cursor-default')}
            >
              {wh.name} <span className={cn('ml-1 text-xs', warehouseId === wh.id ? 'text-white/80' : 'text-muted-foreground')}>#{wh.agency_number}</span>
            </button>
          ))}
        </div>
        {warehouseAutoSet && <p data-warehouse-auto className="text-xs font-medium text-muted-foreground">Auto-set from wholesaler</p>}
        {(() => {
          const wh = warehouses.find((x) => x.id === warehouseId);
          return wh ? <p className="text-xs text-muted-foreground">A-3a: {wh.a3a_address} · {wh.a3a_phone} · {wh.a3a_email}</p> : null;
        })()}
      </section>

      {/* Date + recipient */}
      <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="sales-date">Sales Date</Label>
            <Input id="sales-date" type="date" value={salesDate} onChange={(e) => setSalesDate(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <Label>Recipient</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full h-11 justify-between text-base font-normal">
                  <span className={cn('truncate', !recipient.name && 'text-muted-foreground')}>
                    {recipient.name ? `${recipient.name}${recipient.account_number ? ` · ${recipient.account_number}` : ''}` : 'Search saved wholesalers…'}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Name, account #, or city…" value={search} onValueChange={setSearch} />
                  <CommandList>
                    <CommandEmpty>No saved wholesalers match.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__new__" onSelect={startNewWholesaler}>
                        <Plus className="h-4 w-4 mr-2" />
                        New wholesaler{search.trim() ? ` “${search.trim()}”` : ''}
                      </CommandItem>
                    </CommandGroup>
                    {filtered.length > 0 && (
                      <CommandGroup heading={search ? 'Matches' : 'Most recently used'}>
                        {filtered.map((c) => (
                          <CommandItem key={c.id} value={c.id} onSelect={() => pickCustomer(c)}>
                            <Check className={cn('h-4 w-4 mr-2', c.id === customerId ? 'opacity-100' : 'opacity-0')} />
                            <div className="min-w-0">
                              <p className="truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {[c.account_number, c.city].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {showFields && (
          <div className="space-y-4 border-t pt-4">
            {isNewWholesaler && (
              <p className="text-xs text-muted-foreground">New wholesaler — they’ll be added to the directory when you save.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name" value={recipient.name} onChange={(v) => setField('name', v)} className={inputCls} />
              <Field label="Phone" value={recipient.phone} onChange={(v) => setField('phone', v)} className={inputCls} inputMode="tel" />
              <Field label="Address" value={recipient.address_line1} onChange={(v) => setField('address_line1', v)} className={inputCls} />
              <div className="grid grid-cols-[1fr_64px_96px] gap-2">
                <Field label="City" value={recipient.city} onChange={(v) => setField('city', v)} className={inputCls} />
                <Field label="State" value={recipient.state} onChange={(v) => setField('state', v.toUpperCase().slice(0, 2))} className={inputCls} />
                <Field label="ZIP" value={recipient.zip} onChange={(v) => setField('zip', v)} className={inputCls} inputMode="numeric" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr_1fr] items-end">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="flex rounded-lg border overflow-hidden h-11" role="radiogroup" aria-label="Wholesale or transient">
                  {(['wholesale', 'transient'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={recipient.account_type === t}
                      onClick={() => setField('account_type', t)}
                      className={cn('px-4 text-sm font-medium capitalize', recipient.account_type === t ? 'bg-primary text-white' : 'bg-white text-muted-foreground')}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Account #" value={recipient.account_number} onChange={(v) => setField('account_number', v)} className={inputCls} placeholder="e.g. 10006967-1" />
              <Field
                label="Customer ID#"
                value={recipient.customer_id_number}
                onChange={(v) => { setCustomerIdTouched(true); setField('customer_id_number', v); }}
                className={inputCls}
              />
            </div>
            {customerId && edited && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={updateSaved} onChange={(e) => setUpdateSaved(e.target.checked)} className="h-4 w-4 accent-[#C8102E]" />
                Update saved wholesaler{selected ? ` (${selected.name})` : ''}
              </label>
            )}
          </div>
        )}
      </section>

      {/* Products */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b">
          <h2 className="font-serif text-base font-semibold">Products</h2>
          {selected && selected.times_used > 0 && (
            <Button variant="outline" size="sm" onClick={repeatLastOrder} disabled={busy !== null}>
              {busy === 'repeat' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
              Repeat last order
            </Button>
          )}
        </div>
        <div className="divide-y">
          {lineState.map((l) => (
            <div key={l.productId} className={cn('flex items-center gap-3 px-4 sm:px-5 py-2.5', (l.qty ?? 0) > 0 && 'bg-primary/[0.03]')}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{l.description}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{l.brand_code}</span> · {formatCents(l.price_cents)} / {l.unit_type === 'Bottles' ? 'bottle' : l.unit_type}
                </p>
              </div>
              <Input
                aria-label={`Quantity of ${l.description}`}
                inputMode="numeric"
                pattern="[0-9]*"
                value={l.raw}
                placeholder="0"
                onChange={(e) => setQuantities((q) => ({ ...q, [l.productId]: e.target.value.replace(/\s/g, '') }))}
                className={cn('w-20 sm:w-24 h-12 text-lg text-center font-semibold tabular-nums', l.invalid && 'border-red-500')}
              />
              <span className="w-24 text-right text-sm tabular-nums font-medium">
                {l.lineCents > 0 ? formatCents(l.lineCents) : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
          ))}
          {customState.map((c) => (
            <div key={c.key} className="px-4 sm:px-5 py-3 space-y-2 bg-amber-50/40">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-amber-800">Added item</p>
                <button type="button" onClick={() => setCustomRows((rows) => rows.filter((r) => r.key !== c.key))} className="p-1 text-muted-foreground hover:text-red-700" aria-label="Remove added item">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2 grid-cols-[110px_1fr]">
                <MiniField label="Brand code" value={c.brand_code} onChange={(v) => setCustom(c.key, { brand_code: v.toUpperCase() })} />
                <MiniField label="Description" value={c.description} onChange={(v) => setCustom(c.key, { description: v })} />
              </div>
              <div className="grid gap-2 grid-cols-[1fr_1fr_1fr_auto] items-end">
                <MiniField label="Unit type" value={c.unit_type} onChange={(v) => setCustom(c.key, { unit_type: v })} />
                <MiniField label="Price / bottle" value={c.price} onChange={(v) => setCustom(c.key, { price: v })} inputMode="decimal" placeholder="0.00" invalid={c.invalidPrice} />
                <MiniField label="Quantity" value={c.qty} onChange={(v) => setCustom(c.key, { qty: v.replace(/\s/g, '') })} inputMode="numeric" placeholder="0" invalid={c.invalidQty} />
                <span className="h-10 min-w-20 flex items-center justify-end text-sm tabular-nums font-medium">
                  {c.lineCents > 0 ? formatCents(c.lineCents) : <span className="text-muted-foreground">—</span>}
                </span>
              </div>
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.save} onChange={(e) => setCustom(c.key, { save: e.target.checked })} className="h-4 w-4 accent-[#C8102E]" />
                  Save to price list
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 sm:px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setCustomRows((rows) => [...rows, newCustomRow()])}>
            <Plus className="h-4 w-4 mr-1.5" /> Add item
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-1.5">
        <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal">(internal, not printed)</span></Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </section>

      {/* Sticky totals + actions */}
      <div className="fixed bottom-[var(--mobile-nav-h)] md:bottom-0 left-0 md:left-56 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        {/* The app's floating "+" button is hidden on these pages (src/components/nav/visit-fab.tsx). */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="mr-auto">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Receipt Total · {totalBottles} bottle{totalBottles === 1 ? '' : 's'}</p>
            <p className="text-2xl font-serif font-bold tabular-nums">{formatCents(totalCents)}</p>
          </div>
          {formId && (!isFinal || isAdmin) && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy !== null} className="h-11 px-3 text-red-700" title="Delete form">
              <Trash2 className="h-4 w-4" /><span className="sr-only">Delete form</span>
            </Button>
          )}
          {formId && (
            <Button variant="ghost" onClick={() => router.push(WHOLESALE_FORMS_PATH)} className="hidden sm:inline-flex">
              <History className="h-4 w-4 mr-1.5" /> History
            </Button>
          )}
          {!isFinal && (
            <Button variant="outline" onClick={() => save(false)} disabled={busy !== null} className="h-11">
              {busy === 'draft' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save<span className="hidden sm:inline">&nbsp;Draft</span>
            </Button>
          )}
          <Button onClick={() => save(!isFinal)} disabled={busy !== null || !canFinalize} className="h-11" title={canFinalize ? undefined : 'Needs a recipient and at least one bottle'}>
            {busy === 'final' || (isFinal && busy === 'draft') ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            <span className="sm:hidden">{isFinal ? 'Save PDF' : 'Finalize'}</span>
            <span className="hidden sm:inline">{isFinal ? 'Save & Download PDF' : 'Finalize & Download PDF'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, className, placeholder, inputMode }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} placeholder={placeholder} inputMode={inputMode} />
    </div>
  );
}

function MiniField({ label, value, onChange, placeholder, inputMode, invalid }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  invalid?: boolean;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className={cn('h-10', invalid && 'border-red-500')} />
    </label>
  );
}
