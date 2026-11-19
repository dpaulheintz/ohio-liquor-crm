'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { analyzeUpload, commitUpload, discardUpload, type DiffRow, type UploadAnalysis } from '@/app/actions/accounting';
import type { Mapping } from '@/lib/fin/resolve';
import { ACCOUNTING_PATH, FIN_BUCKET, SECTIONS, SECTION_LABEL, fmtMoney, fmtUsd, periodLabel, type Section } from '@/lib/fin/shared';
import { cn } from '@/lib/utils';

type Acct = { gl: string; name: string; section: Section };
type Choice = { mode: 'existing'; gl: string } | { mode: 'create'; gl: string; name: string; section: Section };

function toMappings(choices: Record<string, Choice>): Record<string, Mapping> {
  const out: Record<string, Mapping> = {};
  for (const [k, c] of Object.entries(choices)) {
    if (c.mode === 'existing' && c.gl) out[k] = { gl: c.gl };
    else if (c.mode === 'create' && c.gl && c.name) out[k] = { create: { gl: c.gl, name: c.name, section: c.section } };
  }
  return out;
}

export function UploadClient({ accounts }: { accounts: Acct[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, start] = useTransition();
  const [stage, setStage] = useState<'idle' | 'uploading' | 'review' | 'done'>('idle');
  const [res, setRes] = useState<UploadAnalysis | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [done, setDone] = useState<{ version: number; changed: number; added: number; removed: number; period: string } | null>(null);

  const mappings = () => toMappings(choices);

  async function onFile(file: File) {
    if (!/\.xlsx$/i.test(file.name)) { toast.error('Upload the .xlsx export.'); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error('File is over 20 MB.'); return; }
    setStage('uploading');
    const safe = file.name.replace(/[^A-Za-z0-9._ -]/g, '').replace(/\s+/g, '_').slice(-80) || 'export.xlsx';
    const path = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;
    const { error } = await createClient().storage.from(FIN_BUCKET).upload(path, file, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (error) { toast.error(`Upload failed: ${error.message}`); setStage('idle'); return; }
    const r = await analyzeUpload({ storagePath: path, fileName: file.name });
    if (!r.ok) { toast.error(r.error); await discardUpload(path); setStage('idle'); return; }
    setChoices({});
    setRes(r.data);
    setStage('review');
  }

  const reanalyze = (patch: { sheetName?: string; period?: string } = {}, nextChoices = choices) => start(async () => {
    if (!res) return;
    const m = toMappings(nextChoices);
    const r = await analyzeUpload({ storagePath: res.storagePath, fileName: res.fileName, sheetName: patch.sheetName ?? res.sheetName, period: patch.period ?? res.period, mappings: m });
    if (!r.ok) { toast.error(r.error); return; }
    setRes(r.data);
  });

  const cancel = () => start(async () => {
    if (res) await discardUpload(res.storagePath);
    setRes(null); setStage('idle');
  });

  const commit = () => start(async () => {
    if (!res) return;
    const r = await commitUpload({ storagePath: res.storagePath, fileName: res.fileName, sheetName: res.sheetName, period: res.period, mappings: mappings() });
    if (!r.ok) { toast.error(r.error); return; }
    setDone({ ...r.data, period: res.period });
    setStage('done');
    toast.success(`${periodLabel(res.period)} saved as v${r.data.version}`);
    router.refresh();
  });

  if (stage === 'done' && done) {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 text-sm" data-upload-done>
        <p className="font-semibold text-emerald-900">{periodLabel(done.period, 'long')} saved as version {done.version}.</p>
        <p className="mt-1 text-emerald-900">{done.version === 1 ? 'First upload for this month.' : done.changed + done.added + done.removed === 0 ? 'No changes since the last upload.' : `${done.changed} changed · ${done.added} added · ${done.removed} removed.`} Flags and the close checklist were recalculated.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="h-9 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" href={`${ACCOUNTING_PATH}/flags?m=${done.period.slice(0, 7)}`}>Review flags</a>
          <a className="h-9 rounded-md border bg-background px-3 py-2 text-sm font-medium" href={`${ACCOUNTING_PATH}?m=${done.period.slice(0, 7)}`}>Overview</a>
          <button type="button" className="h-9 rounded-md border bg-background px-3 text-sm" onClick={() => { setRes(null); setDone(null); setStage('idle'); }}>Upload another</button>
        </div>
      </div>
    );
  }

  if (stage !== 'review' || !res) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
        data-upload-drop
      >
        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drop the “Profit &amp; Loss – Location Side by Side” export (.xlsx)</p>
        <p className="text-xs text-muted-foreground">Columns are matched by location name and rows by account, in any order. Nothing is saved until every check passes and you confirm.</p>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        <button type="button" disabled={stage === 'uploading'} onClick={() => inputRef.current?.click()} className="mt-2 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Upload className="h-4 w-4" />{stage === 'uploading' ? 'Reading…' : 'Choose file'}
        </button>
      </div>
    );
  }

  const a = res.analysis;
  const closed = res.periodStatus === 'closed';
  const canCommit = a.ok && !closed && !busy;
  const diffCount = res.diff ? res.diff.added.length + res.diff.removed.length + res.diff.changed.length : 0;

  return (
    <div className="space-y-4" data-upload-review>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{res.fileName}</span>
        {res.sheets.length > 1 && (
          <select aria-label="Sheet" className="h-9 rounded-md border bg-background px-2 text-sm" value={res.sheetName} disabled={busy} onChange={(e) => reanalyze({ sheetName: e.target.value })}>
            {res.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <span className="text-muted-foreground">Month</span>
        <input type="month" aria-label="Month" className="h-9 rounded-md border bg-background px-2 text-sm" value={res.period.slice(0, 7)} disabled={busy}
          onChange={(e) => e.target.value && reanalyze({ period: `${e.target.value}-01` })} />
        {a.periodEnding && <span className="text-xs text-muted-foreground">file says period ending {a.periodEnding}</span>}
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', closed ? 'bg-red-50 text-red-800' : res.periodStatus === 'open' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800')}>
          {closed ? 'Closed' : res.periodStatus === 'open' ? `Open · replaces v${res.currentVersion ?? '?'}` : 'New month'}
        </span>
      </div>

      {closed && <p className="rounded-lg border-2 border-red-200 bg-red-50 p-3 text-sm text-red-900">{periodLabel(res.period, 'long')} is closed. Reopen it in Settings (with a reason) to upload a new version. You can still review the checks and the changes below.</p>}

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">Columns found</h2>
        <div className="flex flex-wrap gap-2 p-3 text-xs">
          {a.columns.map((c) => <span key={c.col} className={cn('rounded-full border px-2 py-0.5', c.entity ? 'bg-muted/40' : 'border-red-300 text-red-700')}>{c.header} → {c.entity ?? 'unknown'}</span>)}
          {a.unknownHeaders.map((h) => <span key={h} className="rounded-full border border-red-300 px-2 py-0.5 text-red-700">{h} → not a known location (add an alias in Settings)</span>)}
        </div>
      </section>

      {a.unmapped.length > 0 && (
        <section className="rounded-lg border-2 border-amber-300 bg-card" data-mapping>
          <h2 className="border-b px-3 py-2 text-sm font-semibold">Map {a.unmapped.length} account{a.unmapped.length === 1 ? '' : 's'} before importing</h2>
          <ul className="divide-y">
            {a.unmapped.map((u) => {
              const c = choices[u.key];
              const set = (next: Choice) => setChoices((p) => ({ ...p, [u.key]: next }));
              return (
                <li key={u.key} className="space-y-2 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span><span className="font-medium">“{u.label}”</span> <span className="text-xs text-muted-foreground">row {u.row} · under {u.section ? SECTION_LABEL[u.section] : 'unknown section'}</span></span>
                    <span className="tabular-nums text-xs">total {fmtUsd(u.total)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Map ${u.label}`} className="h-9 min-w-[240px] rounded-md border bg-background px-2 text-sm"
                      value={c?.mode === 'create' ? '__new' : c?.gl ?? ''}
                      onChange={(e) => set(e.target.value === '__new'
                        ? { mode: 'create', gl: u.gl ?? '', name: u.name, section: u.section ?? 'opex' }
                        : { mode: 'existing', gl: e.target.value })}>
                      <option value="">Choose an account…</option>
                      <option value="__new">+ New account</option>
                      {SECTIONS.map((s) => (
                        <optgroup key={s} label={SECTION_LABEL[s]}>
                          {accounts.filter((x) => x.section === s).map((x) => <option key={x.gl} value={x.gl}>{x.gl} – {x.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {c?.mode === 'create' && (
                      <>
                        <input aria-label="GL number" placeholder="GL #" value={c.gl} onChange={(e) => set({ ...c, gl: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="h-9 w-20 rounded-md border bg-background px-2 text-sm" />
                        <input aria-label="Account name" placeholder="Name" value={c.name} onChange={(e) => set({ ...c, name: e.target.value })} className="h-9 w-48 rounded-md border bg-background px-2 text-sm" />
                        <select aria-label="Section" value={c.section} onChange={(e) => set({ ...c, section: e.target.value as Section })} className="h-9 rounded-md border bg-background px-2 text-sm">
                          {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                        </select>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t px-3 py-2">
            <button type="button" disabled={busy} onClick={() => reanalyze()} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Checking…' : 'Apply mappings and re-check'}</button>
            <span className="ml-2 text-xs text-muted-foreground">Mappings are saved as aliases so next month’s export maps automatically.</span>
          </div>
        </section>
      )}

      <section className="rounded-lg border bg-card" data-checks>
        <h2 className="border-b px-3 py-2 text-sm font-semibold">Checks (to the cent)</h2>
        <ul className="divide-y">
          {a.checks.map((c) => (
            <li key={c.id} className="px-3 py-2 text-sm" data-check={c.id} data-pass={c.pass}>
              <div className="flex items-center gap-2">
                {c.pass ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                <span className={c.pass ? '' : 'font-semibold text-red-800'}>{c.label}</span>
              </div>
              {!c.pass && c.details.length > 0 && <ul className="ml-6 mt-1 list-disc text-xs text-red-800">{c.details.slice(0, 12).map((d, i) => <li key={i}>{d}</li>)}</ul>}
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{a.lineCount} account lines · {a.mapped.length} rows mapped{a.newAccounts.length > 0 && ` · new accounts: ${a.newAccounts.map((n) => `${n.gl_number} ${n.name}`).join(', ')}`}</p>
      </section>

      {res.diff && (
        <section className="rounded-lg border bg-card" data-diff>
          <h2 className="border-b px-3 py-2 text-sm font-semibold">What changed since the last upload{res.currentVersion ? ` (v${res.currentVersion})` : ''}</h2>
          {!res.diff.hasPrevious ? <p className="px-3 py-3 text-sm text-muted-foreground">Nothing stored for {periodLabel(res.period)} yet — this will be the first version.</p>
            : diffCount === 0 ? <p className="px-3 py-3 text-sm font-semibold text-emerald-800" data-no-changes>No changes — every line matches the stored version to the cent.</p>
            : <DiffTable diff={res.diff} />}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!canCommit} onClick={commit} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" data-commit>
          {busy ? 'Working…' : res.periodStatus === 'open' ? `Save as v${(res.currentVersion ?? 0) + 1}` : 'Import'}
        </button>
        <button type="button" disabled={busy} onClick={cancel} className="h-10 rounded-md border px-4 text-sm">Cancel</button>
        {!a.ok && <span className="text-sm text-red-700">{a.unmapped.length ? 'Map every account to continue.' : 'Fix the failed checks (or the export) to continue.'}</span>}
      </div>
    </div>
  );
}

function DiffTable({ diff }: { diff: NonNullable<UploadAnalysis['diff']> }) {
  const rows: (DiffRow & { kind: string })[] = [
    ...diff.changed.map((r) => ({ ...r, kind: 'changed' })), ...diff.added.map((r) => ({ ...r, kind: 'added' })), ...diff.removed.map((r) => ({ ...r, kind: 'removed' })),
  ];
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full min-w-[560px] text-sm tabular-nums">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-1.5 text-left">Location</th><th className="px-3 py-1.5 text-left">Account</th>
            <th className="px-3 py-1.5 text-right">Was</th><th className="px-3 py-1.5 text-right">Now</th><th className="px-3 py-1.5 text-right">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.entity}-${r.gl}`} className="border-t border-muted/60">
              <td className="px-3 py-1">{r.entity}</td>
              <td className="px-3 py-1">{r.gl} {r.name} {r.kind !== 'changed' && <span className="text-xs text-muted-foreground">({r.kind})</span>}</td>
              <td className="px-3 py-1 text-right">{fmtMoney(r.from)}</td>
              <td className="px-3 py-1 text-right">{fmtMoney(r.to)}</td>
              <td className={cn('px-3 py-1 text-right', (r.to ?? 0) - (r.from ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700')}>{fmtUsd((r.to ?? 0) - (r.from ?? 0), { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
