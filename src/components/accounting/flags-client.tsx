'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setFlagStatus } from '@/app/actions/accounting';
import type { FlagRecord } from '@/lib/fin/server';
import type { FlagType } from '@/lib/fin/flags';
import { ACCOUNTING_PATH, fmtUsd } from '@/lib/fin/shared';
import { SeverityDot } from './bits';
import { cn } from '@/lib/utils';

type Status = 'open' | 'explained' | 'resolved';
const SEV_ORDER = { high: 0, medium: 1, info: 2 } as const;

export function FlagsClient({ flags, accounts, entities, typeLabels, period }: {
  flags: FlagRecord[]; accounts: Record<string, string>; entities: { code: string; name: string }[]; typeLabels: Record<FlagType, string>; period: string;
}) {
  const [entity, setEntity] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState<'all' | Status>('open');
  const [editing, setEditing] = useState<string | null>(null);

  const names = Object.fromEntries(entities.map((e) => [e.code, e.name]));
  const shown = useMemo(() => flags
    .filter((f) => (entity === 'all' || (f.entity_code ?? '') === entity) && (severity === 'all' || f.severity === severity) && (type === 'all' || f.type === type) && (status === 'all' || f.status === status))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0) || (a.entity_code ?? '').localeCompare(b.entity_code ?? '')),
  [flags, entity, severity, type, status]);
  const types = [...new Set(flags.map((f) => f.type))];
  const count = (s: Status) => flags.filter((f) => f.status === s).length;
  const sel = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" data-flag-filters>
        <select aria-label="Location" className={sel} value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">All locations</option>
          {entities.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
          <option value="">Company-wide</option>
        </select>
        <select aria-label="Severity" className={sel} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="all">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="info">Info</option>
        </select>
        <select aria-label="Type" className={sel} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {types.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}
        </select>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value as 'all' | Status)}>
          <option value="open">Open ({count('open')})</option>
          <option value="explained">Explained ({count('explained')})</option>
          <option value="resolved">Resolved ({count('resolved')})</option>
          <option value="all">All ({flags.length})</option>
        </select>
        <span className="text-xs text-muted-foreground">{shown.length} shown · {flags.filter((f) => f.status === 'open' && f.severity === 'high').length} high open</span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No flags match.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card" data-flag-list>
          {shown.map((f) => (
            <li key={f.id} className="px-3 py-2.5" data-flag={f.rule_key}>
              <div className="flex items-start gap-2">
                <span className="mt-1.5"><SeverityDot severity={f.severity} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">{f.severity}</span>
                    <span>{typeLabels[f.type]}</span>
                    <span>· {f.entity_code ? names[f.entity_code] ?? f.entity_code : 'Company'}</span>
                    {f.gl_number && <Link className="hover:underline" href={`${ACCOUNTING_PATH}/account/${f.gl_number}?m=${period.slice(0, 7)}`}>· {f.gl_number} {accounts[f.gl_number] ?? ''}</Link>}
                    {f.impact !== null && <span className="tabular-nums">· impact {fmtUsd(f.impact, { whole: true, sign: true })}</span>}
                    {f.status !== 'open' && <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', f.status === 'resolved' ? 'bg-emerald-50 text-emerald-800' : 'bg-sky-50 text-sky-800')}>{f.status}</span>}
                    {f.stale && <span className="rounded-full bg-muted px-1.5 py-0.5" title="The rule no longer fires on the latest upload">no longer triggered</span>}
                  </div>
                  <p className="mt-0.5 text-sm">{f.message}</p>
                  {f.note && editing !== f.id && <p className="mt-1 text-sm text-muted-foreground">“{f.note}” <span className="text-xs">— {f.noted_by_name ?? ''}{f.noted_at ? `, ${new Date(f.noted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span></p>}
                  {editing === f.id
                    ? <NoteForm flag={f} onDone={() => setEditing(null)} />
                    : <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => setEditing(f.id)}>{f.status === 'open' ? 'Explain / resolve' : 'Edit note'}</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteForm({ flag, onDone }: { flag: FlagRecord; onDone: () => void }) {
  const [note, setNote] = useState(flag.note ?? '');
  const [pending, start] = useTransition();
  const save = (status: Status) => start(async () => {
    const r = await setFlagStatus(flag.id, status, note);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(status === 'open' ? 'Reopened' : `Marked ${status}`);
    onDone();
  });
  return (
    <div className="mt-2 space-y-2">
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="What explains it? (e.g. annual insurance renewal, reclass from payroll)"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" aria-label="Note" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => save('explained')} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">Explained</button>
        <button type="button" disabled={pending} onClick={() => save('resolved')} className="h-9 rounded-md border px-3 text-sm font-medium disabled:opacity-50">Resolved (fixed in books)</button>
        {flag.status !== 'open' && <button type="button" disabled={pending} onClick={() => save('open')} className="h-9 rounded-md border px-3 text-sm disabled:opacity-50">Reopen</button>}
        <button type="button" onClick={onDone} className="h-9 px-2 text-sm text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}
