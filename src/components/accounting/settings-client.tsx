'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  addAlias, deleteAlias, saveAccount, saveCrossCheckMappings, saveEntity, saveThresholds, setPeriodStatus, type Result,
} from '@/app/actions/accounting';
import {
  SECTIONS, SECTION_LABEL, periodLabel,
  type CrossCheckSettings, type FinAccount, type FinAlias, type FinEntity, type FinPeriod, type Section, type Thresholds,
} from '@/lib/fin/shared';
import { cn } from '@/lib/utils';

const input = 'h-9 rounded-md border bg-background px-2 text-sm';
const btn = 'h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50';
const btn2 = 'h-9 rounded-md border px-3 text-sm disabled:opacity-50';

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, ok: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(ok);
    after?.();
  });
  return { pending, run };
}

function Section_({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function SettingsClient({ thresholds, entities, accounts, aliases, periods, crossChecks, locations, audit }: {
  thresholds: Thresholds; entities: FinEntity[]; accounts: FinAccount[]; aliases: FinAlias[];
  periods: (FinPeriod & { version: string | null })[]; crossChecks: CrossCheckSettings; locations: { id: string; name: string }[];
  audit: { id: number; at: string; action: string; period: string | null; detail: Record<string, unknown>; who: string | null }[];
}) {
  return (
    <div className="space-y-4">
      <Months periods={periods} />
      <ThresholdsForm t={thresholds} />
      <Entities entities={entities} locations={locations} />
      <Accounts accounts={accounts} aliases={aliases} />
      <CrossChecks cfg={crossChecks} />
      <Section_ title="Audit log" hint="Uploads, closes and reopens, notes and settings changes (latest 60).">
        <ul className="max-h-[360px] divide-y overflow-auto text-xs" data-audit>
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-2 py-1.5">
              <span className="text-muted-foreground">{new Date(a.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })}</span>
              <span className="font-medium">{a.action.replace(/_/g, ' ')}</span>
              {a.period && <span>{periodLabel(a.period)}</span>}
              <span className="text-muted-foreground">{a.who ?? ''}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={JSON.stringify(a.detail)}>{summarize(a.detail)}</span>
            </li>
          ))}
        </ul>
      </Section_>
    </div>
  );
}

function summarize(d: Record<string, unknown>) {
  const keep = ['note', 'file_name', 'version', 'changed', 'added', 'removed', 'gl_number', 'name', 'alias', 'status', 'entity', 'gl', 'code'];
  return keep.filter((k) => d[k] !== undefined && d[k] !== null && d[k] !== '').map((k) => `${k}: ${String(d[k])}`).join(' · ');
}

// ─── Months ───────────────────────────────────────────────────────────────────

function Months({ periods }: { periods: (FinPeriod & { version: string | null })[] }) {
  const { pending, run } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <Section_ title="Months" hint="Closed months are locked: no upload can change them until they’re reopened (a reason is required and logged).">
      <ul className="divide-y text-sm" data-months>
        {[...periods].reverse().map((p) => (
          <li key={p.period} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="w-24 font-medium">{periodLabel(p.period)}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', p.status === 'closed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>{p.status === 'closed' ? 'Closed' : 'Open'}</span>
            <span className="text-xs text-muted-foreground">{p.version ?? ''}{p.notes ? ` · ${p.notes}` : ''}</span>
            <span className="ml-auto flex items-center gap-2">
              {p.status === 'closed' && <input className={cn(input, 'w-56')} placeholder="Reason to reopen" value={notes[p.period] ?? ''} onChange={(e) => setNotes({ ...notes, [p.period]: e.target.value })} aria-label={`Reason to reopen ${periodLabel(p.period)}`} />}
              <button type="button" disabled={pending} className={btn2}
                onClick={() => run(() => setPeriodStatus(p.period, p.status === 'closed' ? 'open' : 'closed', notes[p.period] ?? ''), p.status === 'closed' ? 'Reopened' : 'Closed')}>
                {p.status === 'closed' ? 'Reopen' : 'Close month'}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Section_>
  );
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const T_FIELDS: { key: keyof Thresholds; label: string; pct?: boolean; money?: boolean }[] = [
  { key: 'mom_pct', label: 'Month-over-month change', pct: true },
  { key: 'yoy_pct', label: 'Year-over-year change', pct: true },
  { key: 'materiality', label: 'Materiality ($)', money: true },
  { key: 'large_multiple', label: 'Large charge (× trailing 3-mo avg)' },
  { key: 'high_priority', label: 'High severity at ($)', money: true },
  { key: 'prime_min', label: 'Prime cost min', pct: true },
  { key: 'prime_max', label: 'Prime cost max', pct: true },
  { key: 'reclass_min', label: 'Reclass: both over ($)', money: true },
  { key: 'reclass_tolerance', label: 'Reclass: amounts within', pct: true },
  { key: 'checklist_window', label: 'Checklist window (closed months)' },
  { key: 'checklist_min_months', label: 'Checklist: posted in at least' },
];

function ThresholdsForm({ t }: { t: Thresholds }) {
  const { pending, run } = useAction();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(T_FIELDS.map((f) => [f.key, f.pct ? String(Math.round(t[f.key] * 1000) / 10) : String(t[f.key])])));
  const save = () => run(() => saveThresholds(Object.fromEntries(T_FIELDS.map((f) => [f.key, f.pct ? Number(v[f.key]) / 100 : Number(v[f.key])]))), 'Thresholds saved — flags recalculate on the next page load');
  return (
    <Section_ title="Flag thresholds">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {T_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
            <span>{f.label}</span>
            <span className="flex items-center gap-1">
              <input inputMode="decimal" className={cn(input, 'w-24 text-right')} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} aria-label={f.label} />
              <span className="w-3 text-xs text-muted-foreground">{f.pct ? '%' : ''}</span>
            </span>
          </label>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={save} className={cn(btn, 'mt-3')}>Save thresholds</button>
    </Section_>
  );
}

// ─── Entities ─────────────────────────────────────────────────────────────────

function Entities({ entities, locations }: { entities: FinEntity[]; locations: { id: string; name: string }[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <Section_ title="Locations (entities)" hint="Aliases are the column headers the export may use (e.g. “HBD Westerville”, “7 - Grandview”). Prime range blank = use the global range.">
      <div className="space-y-3">
        {entities.map((e) => <EntityRow key={e.code} e={e} locations={locations} />)}
        {adding
          ? <EntityRow e={{ code: '', name: '', aliases: [], sort_order: (entities.at(-1)?.sort_order ?? 0) + 10, prime_cost_check: true, toast_location_id: null, active: true, prime_min: null, prime_max: null }} locations={locations} isNew onDone={() => setAdding(false)} />
          : <button type="button" className={btn2} onClick={() => setAdding(true)}>+ Add location</button>}
      </div>
    </Section_>
  );
}

function EntityRow({ e, locations, isNew, onDone }: { e: FinEntity; locations: { id: string; name: string }[]; isNew?: boolean; onDone?: () => void }) {
  const { pending, run } = useAction();
  const [f, setF] = useState({ ...e, aliasText: e.aliases.join('\n'), pmin: e.prime_min == null ? '' : String(e.prime_min * 100), pmax: e.prime_max == null ? '' : String(e.prime_max * 100) });
  const save = () => run(() => saveEntity({
    code: f.code, name: f.name, aliases: f.aliasText.split('\n').map((s) => s.trim()).filter(Boolean), prime_cost_check: f.prime_cost_check,
    prime_min: f.pmin === '' ? null : Number(f.pmin) / 100, prime_max: f.pmax === '' ? null : Number(f.pmax) / 100,
    toast_location_id: f.toast_location_id, active: f.active, sort_order: f.sort_order,
  }, isNew), isNew ? 'Location added' : 'Location saved', onDone);
  return (
    <div className="grid gap-2 rounded-md border p-2 text-sm md:grid-cols-[80px_1fr_1fr_auto]" data-entity={e.code}>
      <input className={input} value={f.code} disabled={!isNew} onChange={(x) => setF({ ...f, code: x.target.value.toUpperCase() })} placeholder="Code" aria-label="Code" />
      <div className="space-y-2">
        <input className={cn(input, 'w-full')} value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="Name" aria-label="Name" />
        <select className={cn(input, 'w-full')} value={f.toast_location_id ?? ''} onChange={(x) => setF({ ...f, toast_location_id: x.target.value || null })} aria-label="Toast location">
          <option value="">No Toast location</option>
          {locations.map((l) => <option key={l.id} value={l.id}>Toast: {l.name}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.prime_cost_check} onChange={(x) => setF({ ...f, prime_cost_check: x.target.checked })} /> Check prime cost</label>
          <input className={cn(input, 'w-16 text-right')} value={f.pmin} onChange={(x) => setF({ ...f, pmin: x.target.value })} placeholder="min" aria-label="Prime min %" />–
          <input className={cn(input, 'w-16 text-right')} value={f.pmax} onChange={(x) => setF({ ...f, pmax: x.target.value })} placeholder="max" aria-label="Prime max %" />%
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.active} onChange={(x) => setF({ ...f, active: x.target.checked })} /> Active</label>
        </div>
      </div>
      <textarea className="min-h-[84px] rounded-md border bg-background px-2 py-1 text-sm" value={f.aliasText} onChange={(x) => setF({ ...f, aliasText: x.target.value })} placeholder="Column header aliases, one per line" aria-label="Aliases" />
      <div className="flex gap-2 md:flex-col">
        <button type="button" disabled={pending} onClick={save} className={btn}>{isNew ? 'Add' : 'Save'}</button>
        {isNew && <button type="button" onClick={onDone} className={btn2}>Cancel</button>}
      </div>
    </div>
  );
}

// ─── Accounts + aliases ───────────────────────────────────────────────────────

function Accounts({ accounts, aliases }: { accounts: FinAccount[]; aliases: FinAlias[] }) {
  const { pending, run } = useAction();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ gl_number: string; name: string; section: Section; active: boolean }>({ gl_number: '', name: '', section: 'opex', active: true });
  const [alias, setAlias] = useState({ text: '', gl: '' });
  const byGl = new Map<string, FinAlias[]>();
  for (const a of aliases) byGl.set(a.gl_number, [...(byGl.get(a.gl_number) ?? []), a]);
  const shown = accounts.filter((a) => !q || `${a.gl_number} ${a.name} ${(byGl.get(a.gl_number) ?? []).map((x) => x.alias).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section_ title="Accounts and aliases" hint="Aliases let an export without account numbers (or with a renamed account) map automatically. Matching ignores case, spaces and punctuation.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={cn(input, 'w-56')} placeholder="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search accounts" />
        <span className="text-xs text-muted-foreground">{accounts.length} accounts · {aliases.length} aliases</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-sm">
        <span className="text-xs font-semibold">New account</span>
        <input className={cn(input, 'w-20')} placeholder="GL #" value={draft.gl_number} onChange={(e) => setDraft({ ...draft, gl_number: e.target.value.replace(/\D/g, '').slice(0, 6) })} aria-label="New GL number" />
        <input className={cn(input, 'w-48')} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="New account name" />
        <select className={input} value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value as Section })} aria-label="New account section">{SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}</select>
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => saveAccount(draft, true), 'Account added', () => setDraft({ gl_number: '', name: '', section: 'opex', active: true }))}>Add</button>
        <span className="mx-2 h-5 w-px bg-border" />
        <span className="text-xs font-semibold">New alias</span>
        <input className={cn(input, 'w-48')} placeholder="Name as it appears" value={alias.text} onChange={(e) => setAlias({ ...alias, text: e.target.value })} aria-label="Alias text" />
        <select className={cn(input, 'w-48')} value={alias.gl} onChange={(e) => setAlias({ ...alias, gl: e.target.value })} aria-label="Alias account">
          <option value="">Account…</option>
          {accounts.map((a) => <option key={a.gl_number} value={a.gl_number}>{a.gl_number} – {a.name}</option>)}
        </select>
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => addAlias(alias.text, alias.gl), 'Alias added', () => setAlias({ text: '', gl: '' }))}>Add</button>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[640px] text-sm" data-accounts>
          <thead className="sticky top-0 bg-card"><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-2 py-1.5 text-left">GL</th><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Section</th><th className="px-2 py-1.5 text-left">Aliases</th><th /></tr></thead>
          <tbody>
            {shown.map((a) => editing === a.gl_number
              ? <AccountEdit key={a.gl_number} a={a} onDone={() => setEditing(null)} />
              : (
                <tr key={a.gl_number} className={cn('border-t border-muted/60', !a.active && 'text-muted-foreground')}>
                  <td className="px-2 py-1.5 tabular-nums">{a.gl_number}</td>
                  <td className="px-2 py-1.5">{a.name}{!a.active && ' (inactive)'}</td>
                  <td className="px-2 py-1.5 text-xs">{SECTION_LABEL[a.section]}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {(byGl.get(a.gl_number) ?? []).map((x) => (
                      <span key={x.alias_key} className="mr-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                        {x.alias}
                        <button type="button" aria-label={`Delete alias ${x.alias}`} className="text-muted-foreground hover:text-red-700" disabled={pending} onClick={() => run(() => deleteAlias(x.alias_key), 'Alias deleted')}>×</button>
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-right"><button type="button" className="text-xs text-primary hover:underline" onClick={() => setEditing(a.gl_number)}>Edit</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Section_>
  );
}

function AccountEdit({ a, onDone }: { a: FinAccount; onDone: () => void }) {
  const { pending, run } = useAction();
  const [f, setF] = useState({ gl_number: a.gl_number, name: a.name, section: a.section, active: a.active });
  return (
    <tr className="border-t bg-muted/30">
      <td className="px-2 py-1.5 tabular-nums">{a.gl_number}</td>
      <td className="px-2 py-1.5"><input className={cn(input, 'w-full')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Account name" /></td>
      <td className="px-2 py-1.5"><select className={input} value={f.section} onChange={(e) => setF({ ...f, section: e.target.value as Section })} aria-label="Section">{SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}</select></td>
      <td className="px-2 py-1.5 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label></td>
      <td className="space-x-2 whitespace-nowrap px-2 py-1.5 text-right">
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => saveAccount(f), 'Account saved', onDone)}>Save</button>
        <button type="button" className={btn2} onClick={onDone}>Cancel</button>
      </td>
    </tr>
  );
}

// ─── Cross-check mappings ─────────────────────────────────────────────────────

function CrossChecks({ cfg }: { cfg: CrossCheckSettings }) {
  const { pending, run } = useAction();
  const [f, setF] = useState({ sales_gls: cfg.sales_gls.join(', '), dsp_gl: cfg.dsp_gl, dsp_entity: cfg.dsp_entity });
  return (
    <Section_ title="Cross-check mappings" hint="Which P&L accounts compare with Toast F&B revenue (per location’s Toast mapping above) and with Bottle Sales “paid to us”.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">Toast F&amp;B ↔ GLs <input className={cn(input, 'w-36')} value={f.sales_gls} onChange={(e) => setF({ ...f, sales_gls: e.target.value })} aria-label="Sales GLs" /></label>
        <label className="flex items-center gap-2">Bottle Sales ↔ <input className={cn(input, 'w-16')} value={f.dsp_entity} onChange={(e) => setF({ ...f, dsp_entity: e.target.value.toUpperCase() })} aria-label="Bottle sales entity" /></label>
        <input className={cn(input, 'w-20')} value={f.dsp_gl} onChange={(e) => setF({ ...f, dsp_gl: e.target.value })} aria-label="Bottle sales GL" />
        <button type="button" disabled={pending} className={btn} onClick={() => run(() => saveCrossCheckMappings(f), 'Cross-checks saved')}>Save</button>
      </div>
    </Section_>
  );
}
