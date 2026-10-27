'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertOctagon, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, FileText,
  Loader2, Lock, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Unlock, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import {
  acknowledgeFlag, addAdjustment, addTipCreditMakeup, approveRun, deleteAdjustment, deleteDraftRun, editLine,
  getOutputPreview, processRunAction, registerRunFile, removeRunFile, reopenRun, updateRunFile,
} from '@/app/actions/payroll';
import type { FlagRow, LineRow, RunFileRow, RunRow } from '@/lib/payroll/server';
import type { LocationSummary, Paycode, PayrollEmployee, PayrollLocation } from '@/lib/payroll/types';
import { centsDisplay, centsPlain, displayDate, hoursPlain } from '@/lib/payroll/units';
import { cn } from '@/lib/utils';
import { FileDropper, type PreparedFile, type SavedMapping } from '../../file-dropper';
import { StatusBadge } from '../../status-badge';

interface Props {
  run: RunRow;
  files: RunFileRow[];
  lines: LineRow[];
  flags: FlagRow[];
  summaries: LocationSummary[];
  config: { locations: PayrollLocation[]; employees: PayrollEmployee[]; paycodes: Paycode[] };
  savedMappings: SavedMapping[];
}

const TIP = ['CCTIPS', 'CASHTIPS'];

export function RunClient({ run, files, lines, flags, summaries, config, savedMappings }: Props) {
  const router = useRouter();
  const locked = run.status === 'approved' || run.status === 'exported';
  const [busy, setBusy] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState<{ employeeId: string | null; toastName: string; locationId: string | null; jobTitle: string; earningType?: string } | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);

  const locName = (id: string | null) => config.locations.find((l) => l.id === id)?.name ?? 'Unassigned';
  const blockers = flags.filter((f) => f.severity === 'blocker');
  const openWarnings = flags.filter((f) => f.severity === 'warning' && !f.resolved_at);
  const canApprove = !locked && run.processed_at && blockers.length === 0 && openWarnings.length === 0 && lines.length > 0;

  async function act(label: string, fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(label);
    try {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? 'Something went wrong');
      else {
        if (success) toast.success(success);
        router.refresh();
      }
      return res.ok;
    } finally {
      setBusy(null);
    }
  }

  async function uploadFiles(prepared: PreparedFile[]) {
    setBusy('upload');
    const sb = createClient();
    let added = 0;
    for (const f of prepared) {
      const path = `runs/${run.id}/${crypto.randomUUID()}.csv`;
      const { error } = await sb.storage.from('payroll-uploads').upload(path, new Blob([f.text], { type: 'text/csv' }), { contentType: 'text/csv' });
      if (error) { toast.error(`${f.name}: ${error.message}`); continue; }
      const res = await registerRunFile(run.id, { storagePath: path, originalName: f.name, kind: f.kind, locationId: f.locationId, mapping: f.mapping, signature: f.signature, droppedColumns: f.dropped });
      if (!res.ok) toast.error(`${f.name}: ${res.error}`);
      else added++;
    }
    if (added) {
      const res = await processRunAction(run.id);
      if (res.ok) toast.success(`${added} file${added === 1 ? '' : 's'} added · ${res.data.blockers} blocker(s), ${res.data.warnings} warning(s)`);
      else toast.error(res.error);
    }
    setBusy(null);
    router.refresh();
  }

  // ── Employees ──
  const employees = useMemo(() => {
    const m = new Map<string, { key: string; name: string; employeeId: string | null; code: string | null; lines: LineRow[] }>();
    for (const l of lines) {
      const key = l.employee_id ?? `name:${l.toast_name.toLowerCase()}`;
      const emp = config.employees.find((e) => e.id === l.employee_id);
      const cur = m.get(key) ?? { key, name: l.toast_name, employeeId: l.employee_id, code: emp?.paycom_employee_code ?? null, lines: [] };
      cur.lines.push(l);
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, config.employees]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl font-semibold">{displayDate(run.period_start)} – {displayDate(run.period_end)}</h2>
            <StatusBadge status={run.status} />
            {locked && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Locked</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created by {run.created_by_name ?? '—'}
            {run.approved_at && ` · approved by ${run.approved_by_name ?? '—'} ${new Date(run.approved_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}`}
            {run.exported_at && ` · exported ${new Date(run.exported_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}`}
          </p>
        </div>
        {!locked && (
          <Button variant="outline" size="sm" onClick={() => act('check', () => processRunAction(run.id), 'Checks re-run')} disabled={busy !== null || files.length === 0}>
            {busy === 'check' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />} Re-check
          </Button>
        )}
        {!locked && (
          <Button size="sm" onClick={() => act('approve', () => approveRun(run.id), 'Run approved and locked')} disabled={!canApprove || busy !== null}
            title={canApprove ? undefined : 'Fix every blocker and acknowledge every warning first'}>
            {busy === 'approve' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Approve
          </Button>
        )}
        {locked && (
          <>
            <Button asChild size="sm"><a href={`/api/payroll/runs/${run.id}/export`} onClick={() => setTimeout(() => router.refresh(), 1500)}><Download className="h-4 w-4 mr-1.5" /> Download Paycom file</a></Button>
            <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}><Unlock className="h-4 w-4 mr-1.5" /> Reopen</Button>
          </>
        )}
        <Button asChild variant="outline" size="sm"><a href={`/api/payroll/runs/${run.id}/summary`}><FileText className="h-4 w-4 mr-1.5" /> Summary PDF</a></Button>
        {!locked && (
          <Button variant="ghost" size="sm" className="text-red-700" disabled={busy !== null}
            onClick={() => { if (window.confirm('Delete this unapproved run and its uploaded files?')) void act('delete', () => deleteDraftRun(run.id)).then((ok) => ok && router.push('/payroll')); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Files */}
      <section className="space-y-3">
        <h3 className="font-serif text-base font-semibold">Toast files</h3>
        {files.length > 0 && (
          <div className="rounded-xl border bg-card divide-y text-sm">
            {files.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-medium flex-1 min-w-[160px] truncate" title={f.original_name ?? ''}>{f.original_name}</span>
                <span className="text-xs rounded bg-muted px-1.5 py-0.5">{f.file_kind === 'payroll_export' ? 'Payroll Export' : 'Time Entries'}</span>
                {locked ? (
                  <span className="text-xs">{locName(f.location_id)}</span>
                ) : (
                  <select value={f.location_id ?? ''} disabled={busy !== null}
                    onChange={(e) => act('file', () => updateRunFile(f.id, { locationId: e.target.value || null }), 'Location updated')}
                    className={cn('h-8 rounded-md border bg-white px-2 text-xs', !f.location_id && 'border-red-400')}>
                    <option value="">Choose location…</option>
                    {config.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
                <span className="text-xs text-muted-foreground">{f.row_count} rows{f.control_totals ? ' · totals ✓' : ''}{f.dropped_columns.length ? ` · removed ${f.dropped_columns.join(', ')}` : ''}</span>
                {!locked && (
                  <button type="button" onClick={() => { if (window.confirm(`Remove ${f.original_name}?`)) void act('file', () => removeRunFile(f.id), 'File removed'); }} className="text-muted-foreground hover:text-red-700" aria-label="Remove file"><X className="h-4 w-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
        {!locked && <FileDropper locations={config.locations} savedMappings={savedMappings} busy={busy !== null} confirmLabel={busy === 'upload' ? 'Uploading…' : 'Add files & check'} onConfirm={uploadFiles} />}
      </section>

      {lines.length > 0 && <SummaryCards summaries={summaries} locName={locName} />}

      {/* Flags */}
      {run.processed_at && (
        <section className="space-y-2">
          <h3 className="font-serif text-base font-semibold">Checks</h3>
          {flags.length === 0 ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 flex items-center gap-2"><Check className="h-4 w-4" /> No blockers or warnings.</div>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {blockers.length > 0 && <p className="px-4 py-2 text-xs font-semibold text-red-800 bg-red-50">{blockers.length} blocker{blockers.length === 1 ? '' : 's'} — fix these before approving</p>}
              {blockers.map((f) => <FlagItem key={f.id} flag={f} locked={locked} busy={busy} act={act} onFixOt={() => setAdjustFor({ employeeId: lines.find((l) => l.toast_name === f.toast_name)?.employee_id ?? null, toastName: f.toast_name ?? '', locationId: null, jobTitle: '', earningType: 'OT' })} />)}
              {flags.some((f) => f.severity === 'warning') && <p className="px-4 py-2 text-xs font-semibold text-amber-900 bg-amber-50">{openWarnings.length} of {flags.filter((f) => f.severity === 'warning').length} warning(s) still need acknowledging</p>}
              {flags.filter((f) => f.severity === 'warning').map((f) => <FlagItem key={f.id} flag={f} locked={locked} busy={busy} act={act} />)}
            </div>
          )}
        </section>
      )}

      {/* Employees */}
      {lines.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-semibold">Employees ({employees.length})</h3>
            {!locked && <Button variant="outline" size="sm" onClick={() => setAdjustFor({ employeeId: null, toastName: '', locationId: null, jobTitle: '' })}><Plus className="h-4 w-4 mr-1.5" /> Adjustment</Button>}
          </div>
          <EmployeeTable employees={employees} locName={locName} locked={locked} busy={busy} act={act} onAdjust={(e) => setAdjustFor({ employeeId: e.employeeId, toastName: e.name, locationId: e.lines[0]?.location_id ?? null, jobTitle: e.lines[0]?.job_title ?? '' })} />
        </section>
      )}

      {/* Output preview */}
      {lines.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-base font-semibold">Paycom file preview</h3>
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={async () => {
              setBusy('preview');
              const res = await getOutputPreview(run.id);
              setBusy(null);
              if (res.ok) setPreview(res.data); else toast.error(res.error);
            }}>{busy === 'preview' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}{preview ? 'Refresh preview' : 'Preview exact file'}</Button>
          </div>
          {preview && (
            <div className="rounded-xl border bg-card overflow-x-auto max-h-[480px]">
              <table className="w-full text-xs font-mono">
                <thead className="sticky top-0 bg-muted"><tr>{preview.headers.map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{preview.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn('px-2 py-1 whitespace-nowrap', !c && preview.headers[j] === 'Employee Code' && 'bg-red-50')}>{c}</td>)}</tr>)}</tbody>
              </table>
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground border-t">{preview.rows.length} rows · this is exactly what the download will contain</p>
            </div>
          )}
        </section>
      )}

      {adjustFor && (
        <AdjustmentDialog
          runId={run.id}
          initial={adjustFor}
          employees={employees}
          allEmployees={config.employees}
          locations={config.locations}
          paycodes={config.paycodes}
          onClose={() => setAdjustFor(null)}
          onSaved={() => { setAdjustFor(null); router.refresh(); }}
        />
      )}
      {reopenOpen && (
        <ReasonDialog title="Reopen this run?" description="Reopening unlocks the run for changes and is recorded in the audit log." confirm="Reopen"
          onClose={() => setReopenOpen(false)}
          onConfirm={async (reason) => { const ok = await act('reopen', () => reopenRun(run.id, reason), 'Run reopened'); if (ok) setReopenOpen(false); }} />
      )}
    </div>
  );
}

type Act = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => Promise<boolean>;

function Metric({ label, value, control, fmt }: { label: string; value: number; control: number | null; fmt: (v: number) => string }) {
  const diff = control == null ? null : value - control;
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums flex items-center gap-1">
        {fmt(value)}
        {diff === null ? null : diff === 0
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-700" aria-label="Matches Toast" />
          : <span className="text-red-700 font-semibold" title={`Toast: ${fmt(control!)}`}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>}
      </span>
    </div>
  );
}

function SummaryCards({ summaries, locName }: { summaries: LocationSummary[]; locName: (id: string | null) => string }) {
  const total = summaries.reduce((a, s) => ({
    employees: a.employees + s.employees, regHh: a.regHh + s.regHh, otHh: a.otHh + s.otHh, tipsCents: a.tipsCents + s.tipsCents,
    gratCents: a.gratCents + s.gratCents, grossCents: a.grossCents + s.grossCents,
  }), { employees: 0, regHh: 0, otHh: 0, tipsCents: 0, gratCents: 0, grossCents: 0 });
  const ctrl = (s: LocationSummary) => s.control;
  const allControl = summaries.every((s) => s.control);
  const sumC = (f: (s: LocationSummary) => number) => (allControl ? summaries.reduce((a, s) => a + f(s), 0) : null);
  const cards = [
    ...summaries.map((s) => ({
      title: locName(s.locationId), employees: s.employees, regHh: s.regHh, otHh: s.otHh, tips: s.tipsCents, grat: s.gratCents, gross: s.grossCents,
      c: ctrl(s) ? { regHh: s.control!.regHh, otHh: s.control!.otHh, tips: s.control!.cctipsCents + s.control!.cashtipsCents, grat: s.control!.gratCents,
        gross: s.control!.regPayCents + s.control!.otPayCents + s.control!.cctipsCents + s.control!.cashtipsCents + s.control!.gratCents } : null,
    })),
    {
      title: 'Total', employees: total.employees, regHh: total.regHh, otHh: total.otHh, tips: total.tipsCents, grat: total.gratCents, gross: total.grossCents,
      c: allControl ? {
        regHh: sumC((s) => s.control!.regHh)!, otHh: sumC((s) => s.control!.otHh)!, tips: sumC((s) => s.control!.cctipsCents + s.control!.cashtipsCents)!,
        grat: sumC((s) => s.control!.gratCents)!, gross: sumC((s) => s.control!.regPayCents + s.control!.otPayCents + s.control!.cctipsCents + s.control!.cashtipsCents + s.control!.gratCents)!,
      } : null,
    },
  ];
  return (
    <section className="space-y-2">
      <h3 className="font-serif text-base font-semibold">Summary vs Toast control totals</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className={cn('rounded-xl border bg-card p-3 space-y-1', c.title === 'Total' && 'border-primary/40')}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">{c.title}</p><span className="text-xs text-muted-foreground">{c.employees} employees</span></div>
            <Metric label="REG hrs" value={c.regHh} control={c.c?.regHh ?? null} fmt={hoursPlain} />
            <Metric label="OT hrs" value={c.otHh} control={c.c?.otHh ?? null} fmt={hoursPlain} />
            <Metric label="Tips" value={c.tips} control={c.c?.tips ?? null} fmt={centsDisplay} />
            <Metric label="Gratuity" value={c.grat} control={c.c?.grat ?? null} fmt={centsDisplay} />
            <Metric label="Est. gross" value={c.gross} control={c.c?.gross ?? null} fmt={centsDisplay} />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">A red difference means our lines differ from Toast&apos;s totals — expected only where you made an edit or adjustment.</p>
    </section>
  );
}

function FlagItem({ flag, locked, busy, act, onFixOt }: { flag: FlagRow; locked: boolean; busy: string | null; act: Act; onFixOt?: () => void }) {
  const [note, setNote] = useState('');
  const isWarning = flag.severity === 'warning';
  return (
    <div className="px-4 py-3 flex flex-wrap items-start gap-3 text-sm">
      {isWarning ? <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> : <AlertOctagon className="h-4 w-4 text-red-700 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-[240px] space-y-1">
        <p>{flag.message}</p>
        {flag.resolved_at && <p className="text-xs text-green-800">Acknowledged by {flag.resolved_by_name ?? '—'}: “{flag.resolution_note}”</p>}
        {!isWarning && flag.flag_type === 'cross_location_ot' && !locked && onFixOt && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onFixOt}><Plus className="h-3.5 w-3.5 mr-1" /> Add OT adjustment</Button>
        )}
        {isWarning && flag.flag_type === 'tip_credit_shortfall' && !locked && (
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => act('makeup', () => addTipCreditMakeup(flag.id), 'Make-up line added')}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add suggested TIPCREDIT_MAKEUP line
          </Button>
        )}
      </div>
      {isWarning && !flag.resolved_at && !locked && (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required)" className="h-8 text-xs sm:w-56" />
          <Button size="sm" className="h-8" disabled={note.trim().length < 3 || busy !== null} onClick={() => act('ack', () => acknowledgeFlag(flag.id, note), 'Warning acknowledged')}>Acknowledge</Button>
        </div>
      )}
    </div>
  );
}

interface EmpGroup { key: string; name: string; employeeId: string | null; code: string | null; lines: LineRow[] }

function EmployeeTable({ employees, locName, locked, busy, act, onAdjust }: { employees: EmpGroup[]; locName: (id: string | null) => string; locked: boolean; busy: string | null; act: Act; onAdjust: (e: EmpGroup) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ hours: '', rate: '', amount: '', reason: '' });
  const tot = (ls: LineRow[], types: string[], f: 'hours_hh' | 'amount_cents') => ls.filter((l) => types.includes(l.earning_type)).reduce((a, l) => a + l[f], 0);

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2.5 w-6" />
            <th className="text-left font-medium px-2 py-2.5">Employee</th>
            <th className="text-left font-medium px-2 py-2.5">Paycom code</th>
            <th className="text-left font-medium px-2 py-2.5">Locations</th>
            <th className="text-right font-medium px-2 py-2.5">REG</th>
            <th className="text-right font-medium px-2 py-2.5">OT</th>
            <th className="text-right font-medium px-2 py-2.5">Tips</th>
            <th className="text-right font-medium px-2 py-2.5">Gratuity</th>
            <th className="text-right font-medium px-2 py-2.5">Est. gross</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {employees.map((e) => {
            const isOpen = open === e.key;
            const changed = e.lines.some((l) => l.source === 'manual_adjustment' || l.edited_at);
            return (
              <Fragment key={e.key}>
                <tr onClick={() => setOpen(isOpen ? null : e.key)} className="cursor-pointer hover:bg-muted/40">
                  <td className="px-2 py-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                  <td className="px-2 py-2 font-medium">{e.name}{changed && <span className="ml-2 text-[10px] uppercase text-primary">adjusted</span>}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.code ?? <span className="text-red-700 font-sans font-semibold">Unmapped</span>}</td>
                  <td className="px-2 py-2 text-xs">{[...new Set(e.lines.map((l) => locName(l.location_id)))].join(', ')}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{hoursPlain(tot(e.lines, ['REG'], 'hours_hh'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{hoursPlain(tot(e.lines, ['OT'], 'hours_hh'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{centsDisplay(tot(e.lines, TIP, 'amount_cents'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{centsDisplay(tot(e.lines, ['GRAT'], 'amount_cents'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{centsDisplay(e.lines.reduce((a, l) => a + l.amount_cents, 0))}</td>
                </tr>
                {isOpen && (
                  <tr><td colSpan={9} className="bg-muted/30 px-3 py-2">
                    <table className="w-full text-xs">
                      <thead><tr className="text-muted-foreground">
                        <th className="text-left font-medium py-1">Location</th><th className="text-left font-medium py-1">Job</th><th className="text-left font-medium py-1">Code</th>
                        <th className="text-right font-medium py-1">Hours</th><th className="text-right font-medium py-1">Rate</th><th className="text-right font-medium py-1">Amount</th>
                        <th className="text-left font-medium py-1 pl-3">Source / reason</th><th className="py-1" />
                      </tr></thead>
                      <tbody>
                        {e.lines.sort((a, b) => a.earning_type.localeCompare(b.earning_type)).map((l) => editing === l.id ? (
                          <tr key={l.id} className="align-top">
                            <td className="py-1">{locName(l.location_id)}</td><td className="py-1">{l.job_title ?? '—'}</td><td className="py-1 font-mono">{l.earning_type}</td>
                            <td className="py-1 text-right"><Input value={draft.hours} onChange={(ev) => setDraft({ ...draft, hours: ev.target.value })} className="h-7 w-20 text-xs text-right ml-auto" inputMode="decimal" /></td>
                            <td className="py-1 text-right"><Input value={draft.rate} onChange={(ev) => setDraft({ ...draft, rate: ev.target.value })} className="h-7 w-20 text-xs text-right ml-auto" inputMode="decimal" /></td>
                            <td className="py-1 text-right"><Input value={draft.amount} onChange={(ev) => setDraft({ ...draft, amount: ev.target.value })} className="h-7 w-24 text-xs text-right ml-auto" inputMode="decimal" /></td>
                            <td className="py-1 pl-3"><Input value={draft.reason} onChange={(ev) => setDraft({ ...draft, reason: ev.target.value })} placeholder="Reason (required)" className="h-7 text-xs" /></td>
                            <td className="py-1 text-right whitespace-nowrap">
                              <Button size="sm" className="h-7 text-xs" disabled={draft.reason.trim().length < 3 || busy !== null}
                                onClick={async () => { if (await act('edit', () => editLine(l.id, draft), 'Line updated')) setEditing(null); }}>Save</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={l.id}>
                            <td className="py-1">{locName(l.location_id)}</td><td className="py-1">{l.job_title ?? '—'}</td><td className="py-1 font-mono">{l.earning_type}</td>
                            <td className="py-1 text-right tabular-nums">{l.hours_hh ? hoursPlain(l.hours_hh) : '—'}</td>
                            <td className="py-1 text-right tabular-nums">{l.rate_cents != null ? centsDisplay(l.rate_cents) : '—'}</td>
                            <td className="py-1 text-right tabular-nums">{centsDisplay(l.amount_cents)}</td>
                            <td className="py-1 pl-3 text-muted-foreground">
                              {l.source === 'manual_adjustment' ? <span className="text-primary font-medium">Adjustment</span> : l.edited_at ? <span className="text-primary font-medium">Edited</span> : 'Toast'}
                              {l.adjustment_reason && <> · {l.adjustment_reason}</>}
                              {l.original && <span className="block text-[10px]">was {hoursPlain(Number(l.original.hours_hh ?? 0))} hrs · {centsDisplay(Number(l.original.amount_cents ?? 0))}{l.edited_by_name ? ` · by ${l.edited_by_name}` : ''}</span>}
                            </td>
                            <td className="py-1 text-right whitespace-nowrap">
                              {!locked && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => { setEditing(l.id); setDraft({ hours: hoursPlain(l.hours_hh), rate: l.rate_cents != null ? centsPlain(l.rate_cents) : '', amount: centsPlain(l.amount_cents), reason: '' }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                  {l.source === 'manual_adjustment' && (
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-red-700" title="Remove adjustment" onClick={() => {
                                      const reason = window.prompt('Reason for removing this adjustment?');
                                      if (reason) void act('delete-adj', () => deleteAdjustment(l.id, reason), 'Adjustment removed');
                                    }}><Trash2 className="h-3.5 w-3.5" /></Button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!locked && <Button variant="ghost" size="sm" className="h-7 text-xs mt-1" onClick={() => onAdjust(e)}><Plus className="h-3.5 w-3.5 mr-1" /> Adjustment for {e.name}</Button>}
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdjustmentDialog({ runId, initial, employees, allEmployees, locations, paycodes, onClose, onSaved }: {
  runId: string;
  initial: { employeeId: string | null; toastName: string; locationId: string | null; jobTitle: string; earningType?: string };
  employees: EmpGroup[];
  allEmployees: PayrollEmployee[];
  locations: PayrollLocation[];
  paycodes: Paycode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = useMemo(() => {
    const m = new Map<string, { employeeId: string | null; name: string }>();
    for (const e of employees) m.set(e.employeeId ?? `name:${e.name}`, { employeeId: e.employeeId, name: e.name });
    for (const e of allEmployees) if (!m.has(e.id)) m.set(e.id, { employeeId: e.id, name: e.toast_name });
    return [...m.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [employees, allEmployees]);
  const initialKey = initial.employeeId ?? (initial.toastName ? `name:${initial.toastName}` : '');
  const [who, setWho] = useState(initialKey);
  const [loc, setLoc] = useState(initial.locationId ?? '');
  const [job, setJob] = useState(initial.jobTitle);
  const [code, setCode] = useState(initial.earningType ?? 'BONUS');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const pc = paycodes.find((p) => p.earning_type === code);

  async function save() {
    const sel = options.find(([k]) => k === who)?.[1];
    if (!sel) return toast.error('Choose an employee.');
    setSaving(true);
    const res = await addAdjustment(runId, { employeeId: sel.employeeId, toastName: sel.name, locationId: loc || null, jobTitle: job, earningType: code, hours, rate, amount, reason });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Adjustment added');
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add adjustment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Employee</Label>
            <select value={who} onChange={(e) => setWho(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
              <option value="">Choose…</option>
              {options.map(([k, o]) => <option key={k} value={k}>{o.name}{o.employeeId ? '' : ' (unmapped)'}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Location</Label>
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
                <option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Job title</Label><Input value={job} onChange={(e) => setJob(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Earning code</Label>
            <select value={code} onChange={(e) => setCode(e.target.value)} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
              {paycodes.map((p) => <option key={p.earning_type} value={p.earning_type}>{p.earning_type} — {p.description}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5"><Label>Hours</Label><Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder={pc?.kind === 'hours' ? '5.00' : '0'} inputMode="decimal" /></div>
            <div className="space-y-1.5"><Label>Rate</Label><Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" inputMode="decimal" /></div>
            <div className="space-y-1.5"><Label>Amount</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">Use a negative value to move hours or money out (e.g. −5.00 REG with +5.00 OT). Amounts are exact to the cent.</p>
          <div className="space-y-1.5"><Label>Reason (required)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || reason.trim().length < 3 || !who}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Add</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({ title, description, confirm, onClose, onConfirm }: { title: string; description: string; confirm: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(reason)} disabled={reason.trim().length < 3}><RotateCcw className="h-4 w-4 mr-1.5" />{confirm}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
