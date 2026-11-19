'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Check, CircleDashed, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { setChecklistItem } from '@/app/actions/accounting';
import type { ChecklistRecord } from '@/lib/fin/server';
import { ACCOUNTING_PATH, fmtUsd } from '@/lib/fin/shared';
import { cn } from '@/lib/utils';

type Item = ChecklistRecord & { current: number };

export function ChecklistClient({ items, accounts, entities, period }: { items: Item[]; accounts: Record<string, string>; entities: { code: string; name: string }[]; period: string }) {
  const [hideDone, setHideDone] = useState(false);
  const missing = items.filter((i) => i.status === 'missing').length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold">{missing} missing</span>
        <span className="text-muted-foreground">{items.filter((i) => i.status === 'posted').length} posted · {items.filter((i) => i.status === 'not_needed').length} not needed</span>
        <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done</label>
      </div>
      <div className="grid gap-3 lg:grid-cols-2" data-checklist>
        {entities.map((e) => {
          const rows = items.filter((i) => i.entity_code === e.code && (!hideDone || i.status === 'missing'));
          const all = items.filter((i) => i.entity_code === e.code);
          if (!all.length) return null;
          return (
            <section key={e.code} className="rounded-lg border bg-card" data-checklist-entity={e.code}>
              <h2 className="flex items-baseline justify-between border-b px-3 py-2 text-sm font-semibold">
                {e.name}<span className="text-xs font-normal text-muted-foreground">{all.filter((i) => i.status === 'missing').length} of {all.length} open</span>
              </h2>
              <ul className="divide-y">
                {rows.map((i) => <Row key={i.gl_number} item={i} name={accounts[i.gl_number] ?? ''} period={period} />)}
                {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">All done.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({ item, name, period }: { item: Item; name: string; period: string }) {
  const [note, setNote] = useState(item.note ?? '');
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const save = (status: Item['status']) => start(async () => {
    const r = await setChecklistItem({ period, entity: item.entity_code, gl: item.gl_number, status, note });
    if (!r.ok) { toast.error(r.error); return; }
    setOpen(false);
  });
  const Icon = item.status === 'posted' ? Check : item.status === 'not_needed' ? MinusCircle : CircleDashed;
  return (
    <li className="px-3 py-2" data-checklist-item={`${item.entity_code}-${item.gl_number}`}>
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', item.status === 'posted' ? 'text-emerald-600' : item.status === 'not_needed' ? 'text-muted-foreground' : 'text-amber-600')} aria-label={item.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <Link href={`${ACCOUNTING_PATH}/account/${item.gl_number}?m=${period.slice(0, 7)}`} className={cn('text-sm font-medium hover:underline', item.status !== 'missing' && 'text-muted-foreground line-through decoration-1')}>
              {item.gl_number} – {name}
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">expected ~{fmtUsd(item.expected, { whole: true })}{item.current !== 0 && ` · now ${fmtUsd(item.current, { whole: true })}`}</span>
          </div>
          <div className="text-xs text-muted-foreground">posted {item.months_posted} of the last {item.window_months} closed months</div>
          {item.note && !open && <p className="mt-0.5 text-xs">“{item.note}”</p>}
          {open ? (
            <div className="mt-2 space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (required for Not needed)" aria-label="Note" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => save('posted')} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">Posted</button>
                <button type="button" disabled={pending} onClick={() => save('not_needed')} className="h-9 rounded-md border px-3 text-sm font-medium disabled:opacity-50">Not needed</button>
                {item.status !== 'missing' && <button type="button" disabled={pending} onClick={() => save('missing')} className="h-9 rounded-md border px-3 text-sm disabled:opacity-50">Still missing</button>}
                <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-sm text-muted-foreground">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-primary hover:underline">{item.status === 'missing' ? 'Mark posted / not needed' : 'Change'}</button>
          )}
        </div>
      </div>
    </li>
  );
}
