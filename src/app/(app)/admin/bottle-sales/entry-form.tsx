'use client';

// Log Sales (new entry) and Edit Entry. Big, thumb-friendly: date, location, type, then a SKU list with
// quantity inputs (+6 / +12 for cases), a live total bar and Save.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, History, Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { deleteBottleSalesEntry, saveBottleSalesEntry, type SaveEntryResult } from '@/app/actions/bottle-sales';
import {
  BOTTLE_SALES_PATH, SALE_TYPES, fmtInt, fmtUsd, isDelisted, toCents,
  type BottleLocation, type OhlqProduct,
} from '@/lib/bottle-sales';

export interface EntryFormData {
  products: OhlqProduct[];
  locations: BottleLocation[];
  usage: Record<string, number>;
  lastByKey: Record<string, { date: string; qty: Record<string, number> }>;
}
interface ExistingLine { id: string; sku: string; bottles: number; paid_per_bottle: number; wholesale_c_per: number; retail_c_per: number }
interface EditProps {
  entryId: string;
  date: string;
  location: string;
  type: string;
  notes: string;
  lines: ExistingLine[];
}

export function EntryForm(props: EntryFormData & { mode: 'new'; today: string } | EntryFormData & { mode: 'edit'; today: string; edit: EditProps }) {
  const { products, locations, usage, lastByKey, mode, today } = props;
  const edit = mode === 'edit' ? props.edit : null;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(edit?.date ?? today);
  const [location, setLocation] = useState(edit?.location ?? '');
  const [type, setType] = useState(edit?.type ?? '');
  const [notes, setNotes] = useState(edit?.notes ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [existing, setExisting] = useState<(ExistingLine & { removed?: boolean })[]>(edit?.lines ?? []);
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState<SaveEntryResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bySku = useMemo(() => new Map(products.map((p) => [p.sku, p])), [products]);
  const key = location && type ? `${location}|${type}` : '';
  const last = key ? lastByKey[key] : undefined;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const score = (sku: string) => (key ? (usage[`${key}|${sku}`] ?? 0) * 1000 : 0) + (usage[`*|${sku}`] ?? 0);
    return products
      .filter((p) => showAll || !isDelisted(p) || (qty[p.sku] ?? 0) > 0)
      .filter((p) => !needle || `${p.display_name} ${p.sku} ${p.item_name}`.toLowerCase().includes(needle))
      .sort((a, b) => score(b.sku) - score(a.sku) || a.sort_order - b.sort_order);
  }, [products, q, showAll, key, usage, qty]);

  const totals = useMemo(() => {
    let bottles = 0, paid = 0, wholesale = 0;
    for (const l of existing) if (!l.removed) { bottles += l.bottles; paid += toCents(l.paid_per_bottle) * l.bottles; wholesale += l.wholesale_c_per * l.bottles; }
    for (const [sku, n] of Object.entries(qty)) {
      const p = bySku.get(sku); if (!p || n <= 0) continue;
      bottles += n; paid += toCents(p.paid_per_bottle) * n; wholesale += toCents(p.wholesale_price) * n;
    }
    return { bottles, paid, wholesale };
  }, [existing, qty, bySku]);

  const setN = (sku: string, n: number) => setQty((m) => ({ ...m, [sku]: Math.max(0, Math.min(99999, Math.floor(n) || 0)) }));
  const bump = (sku: string, d: number) => setN(sku, (qty[sku] ?? 0) + d);

  function repeatLast() {
    if (!last) return;
    setQty({ ...last.qty });
    toast.success(`Filled from ${last.date}`);
  }

  function save() {
    if (!location) return toast.error('Pick a location');
    if (!type) return toast.error('Pick a type');
    if (totals.bottles <= 0) return toast.error('Add at least one bottle');
    start(async () => {
      try {
        const res = await saveBottleSalesEntry({
          entryId: edit?.entryId ?? null, date, location, type, notes,
          lines: [
            ...existing.filter((l) => !l.removed).map((l) => ({ id: l.id, sku: l.sku, bottles: l.bottles })),
            ...Object.entries(qty).filter(([, n]) => n > 0).map(([sku, n]) => ({ sku, bottles: n })),
          ],
        });
        if (edit) { toast.success(`Saved · ${fmtInt(res.bottles)} bottles · ${fmtUsd(res.paid_c)}`); router.push(BOTTLE_SALES_PATH + '/entries'); router.refresh(); return; }
        setDone(res); document.querySelector('main')?.scrollTo({ top: 0 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save');
      }
    });
  }

  function remove() {
    if (!edit) return;
    start(async () => {
      try {
        const n = await deleteBottleSalesEntry(edit.entryId);
        toast.success(`Deleted entry (${n} line${n === 1 ? '' : 's'})`);
        router.push(BOTTLE_SALES_PATH + '/entries'); router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete');
      }
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-7 w-7" /></div>
        <p className="text-2xl font-semibold">Logged {fmtInt(done.bottles)} bottles · {fmtUsd(done.paid_c)}</p>
        <p className="text-sm text-muted-foreground">{date} · {locations.find((l) => l.code === location)?.name} · {type} · wholesale {fmtUsd(done.wholesale_c)}</p>
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-12 text-base" onClick={() => { setDone(null); setQty({}); setNotes(''); router.refresh(); }}>Log another</Button>
          <Button variant="outline" asChild><Link href={`${BOTTLE_SALES_PATH}/entries/${done.entryId}`}>View this entry</Link></Button>
        </div>
      </div>
    );
  }

  const seg = 'h-12 rounded-lg border text-base font-semibold transition-colors';
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      {edit && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Edit entry</h2>
          <Link href={`${BOTTLE_SALES_PATH}/entries`} className="text-sm text-muted-foreground hover:text-foreground">Back to entries</Link>
        </div>
      )}

      <section className="space-y-2">
        <label htmlFor="bs-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
        <Input id="bs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 text-base" />
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</div>
        <div className="grid grid-cols-4 gap-2">
          {locations.map((l) => (
            <button key={l.code} type="button" onClick={() => setLocation(l.code)} title={l.name}
              className={cn(seg, location === l.code ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>
              {l.code}
              <span className="block text-[10px] font-normal leading-none opacity-80 -mt-0.5">{l.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</div>
        <div className="grid grid-cols-3 gap-2">
          {SALE_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={cn(seg, type === t ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>{t}</button>
          ))}
        </div>
      </section>

      {edit && existing.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lines in this entry</div>
          <ul className="divide-y rounded-lg border bg-card">
            {existing.map((l, i) => {
              const p = bySku.get(l.sku);
              return (
                <li key={l.id} className={cn('flex items-center gap-3 px-3 py-2', l.removed && 'opacity-40 line-through')}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p?.display_name ?? l.sku}</div>
                    <div className="text-xs text-muted-foreground">{l.sku} · {fmtUsd(toCents(l.paid_per_bottle))}/btl (price at entry)</div>
                  </div>
                  <Input type="number" inputMode="numeric" min={1} value={l.bottles} disabled={l.removed} aria-label={`Bottles of ${l.sku}`}
                    onChange={(e) => setExisting((xs) => xs.map((x, j) => (j === i ? { ...x, bottles: Math.max(1, Math.floor(Number(e.target.value)) || 1) } : x)))}
                    className="h-11 w-24 text-right text-base" />
                  <Button type="button" variant="ghost" size="icon" aria-label={l.removed ? 'Keep line' : 'Remove line'}
                    onClick={() => setExisting((xs) => xs.map((x, j) => (j === i ? { ...x, removed: !x.removed } : x)))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{edit ? 'Add bottles' : 'Bottles'}</div>
          {!edit && (
            <Button type="button" variant="outline" size="sm" disabled={!last} onClick={repeatLast} title={last ? `Same as ${last.date}` : 'Pick a location and type first'}>
              <History className="mr-1.5 h-4 w-4" />Repeat last{last ? ` (${last.date})` : ''}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU" className="h-11 pl-9 text-base" />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4" />Show all
          </label>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {list.map((p) => {
            const n = qty[p.sku] ?? 0;
            return (
              <li key={p.sku} className={cn('px-3 py-2.5', n > 0 && 'bg-amber-50')}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.display_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.sku} · {fmtUsd(toCents(p.paid_per_bottle))}/btl · {p.units_per_case}/case{isDelisted(p) ? ' · delisted' : ''}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`One less ${p.sku}`} onClick={() => bump(p.sku, -1)} disabled={n <= 0}><Minus className="h-4 w-4" /></Button>
                  <Input type="number" inputMode="numeric" min={0} value={n || ''} placeholder="0" aria-label={`Bottles of ${p.sku}`}
                    onChange={(e) => setN(p.sku, Number(e.target.value))} className="h-11 w-16 shrink-0 px-1 text-center text-base" />
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={`One more ${p.sku}`} onClick={() => bump(p.sku, 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="mt-1.5 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" className="h-9 px-3" onClick={() => bump(p.sku, 6)}>+6</Button>
                  <Button type="button" variant="secondary" size="sm" className="h-9 px-3" onClick={() => bump(p.sku, 12)}>+12</Button>
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No products match.</li>}
        </ul>
      </section>

      <section className="space-y-2">
        <label htmlFor="bs-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
        <Input id="bs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bar restock, event" className="h-11 text-base" />
      </section>

      {edit && (
        <section className="rounded-lg border border-destructive/30 p-3">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Delete this whole entry? It’s recorded in the audit log.</span>
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={remove}>Yes, delete</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 className="mr-1.5 h-4 w-4" />Delete entry</Button>
          )}
        </section>
      )}

      <div className="fixed bottom-[var(--mobile-nav-h)] md:bottom-0 left-0 md:left-56 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-lg font-semibold tabular-nums">{fmtInt(totals.bottles)} bottles · {fmtUsd(totals.paid)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">Paid to us · wholesale {fmtUsd(totals.wholesale)}</div>
          </div>
          <Button size="lg" className="h-12 min-w-28 text-base" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
