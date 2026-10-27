import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { hasSensitiveColumns, parseToastCsv } from './detect';
import { buildLines, checkRun, grossByEmployee, lineKey, type EngineContext, type EngineFile } from './engine';
import type {
  ColumnMapping, FileKind, Flag, JobMapping, OutputTemplate, PayLine, Paycode, PayrollEmployee,
  PayrollLocation, PayrollSettings, RunStatus, SourceRow,
} from './types';

export const PAYROLL_BUCKET = 'payroll-uploads';
type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getPayrollAccess(supabase?: Supabase): Promise<{ allowed: boolean; userId: string | null; email: string | null }> {
  const sb = supabase ?? (await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { allowed: false, userId: null, email: null };
  const { data } = await sb.rpc('has_payroll_access');
  return { allowed: data === true, userId: user.id, email: user.email ?? null };
}

/** Every payroll read/write goes through the signed-in user's client, so RLS (payroll_access) applies. */
export async function requirePayroll() {
  const supabase = await createClient();
  const access = await getPayrollAccess(supabase);
  if (!access.allowed) throw new Error('Not authorized');
  return { supabase, userId: access.userId! };
}

export async function log(supabase: Supabase, action: string, details: Record<string, unknown>, runId: string | null = null, entity: string | null = null, entityId: string | null = null) {
  await supabase.rpc('payroll_log', { p_action: action, p_entity: entity, p_entity_id: entityId, p_details: details, p_run_id: runId });
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface PayrollConfig {
  settings: PayrollSettings;
  locations: PayrollLocation[];
  employees: PayrollEmployee[];
  jobs: JobMapping[];
  paycodes: Paycode[];
  template: OutputTemplate;
}

export async function loadConfig(supabase: Supabase): Promise<PayrollConfig> {
  const [settings, locations, employees, jobs, paycodes, template] = await Promise.all([
    supabase.from('payroll_settings').select('*').single(),
    supabase.from('payroll_locations').select('*').order('sort_order'),
    supabase.from('payroll_employees').select('*').order('toast_name'),
    supabase.from('payroll_job_map').select('*').order('toast_job_title'),
    supabase.from('payroll_paycode_map').select('*').order('sort_order'),
    supabase.from('payroll_output_template').select('*').single(),
  ]);
  return {
    settings: must(settings) as PayrollSettings,
    locations: must(locations) as PayrollLocation[],
    employees: must(employees) as PayrollEmployee[],
    jobs: must(jobs) as JobMapping[],
    paycodes: must(paycodes) as Paycode[],
    template: must(template) as OutputTemplate,
  };
}

// ─── Run data ─────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string;
  period_start: string;
  period_end: string;
  status: RunStatus;
  totals: Record<string, unknown> | null;
  notes: string | null;
  processed_at: string | null;
  approved_at: string | null;
  exported_at: string | null;
  created_at: string;
  created_by_name: string | null;
  approved_by_name: string | null;
  exported_by_name: string | null;
}

const RUN_COLUMNS = `id, period_start, period_end, status, totals, notes, processed_at, approved_at, exported_at, created_at,
  creator:profiles!payroll_runs_created_by_fkey(full_name, email),
  approver:profiles!payroll_runs_approved_by_fkey(full_name, email),
  exporter:profiles!payroll_runs_exported_by_fkey(full_name, email)`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const who = (p: any) => (p ? p.full_name || p.email : null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRun = ({ creator, approver, exporter, ...r }: any): RunRow => ({ ...r, created_by_name: who(creator), approved_by_name: who(approver), exported_by_name: who(exporter) });

export async function loadRuns(supabase: Supabase): Promise<RunRow[]> {
  return (must(await supabase.from('payroll_runs').select(RUN_COLUMNS).order('period_start', { ascending: false })) as unknown[]).map(toRun);
}

export async function loadRun(supabase: Supabase, runId: string): Promise<RunRow | null> {
  const data = must(await supabase.from('payroll_runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle());
  return data ? toRun(data) : null;
}

export interface RunFileRow {
  id: string;
  original_name: string | null;
  file_kind: FileKind;
  location_id: string | null;
  sha256: string;
  row_count: number;
  control_totals: Record<string, number> | null;
  column_mapping: ColumnMapping | null;
  dropped_columns: string[];
  storage_path: string;
  created_at: string;
}

export interface LineRow {
  id: string;
  employee_id: string | null;
  toast_name: string;
  toast_employee_id: string | null;
  location_id: string | null;
  job_title: string | null;
  earning_type: string;
  hours_hh: number;
  rate_cents: number | null;
  amount_cents: number;
  source: 'toast' | 'manual_adjustment';
  adjustment_reason: string | null;
  original: Record<string, number | null> | null;
  edited_at: string | null;
  edited_by_name: string | null;
}

export interface FlagRow {
  id: string;
  flag_key: string;
  flag_type: string;
  severity: 'blocker' | 'warning';
  message: string;
  details: Record<string, unknown> | null;
  toast_name: string | null;
  location_id: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
}

export async function loadRunDetail(supabase: Supabase, runId: string) {
  const [files, lines, flags] = await Promise.all([
    supabase.from('payroll_run_files').select('id, original_name, file_kind, location_id, sha256, row_count, control_totals, column_mapping, dropped_columns, storage_path, created_at').eq('run_id', runId).order('created_at'),
    supabase.from('payroll_run_lines').select('id, employee_id, toast_name, toast_employee_id, location_id, job_title, earning_type, hours_hh, rate_cents, amount_cents, source, adjustment_reason, original, edited_at, editor:profiles!payroll_run_lines_edited_by_fkey(full_name, email)').eq('run_id', runId),
    supabase.from('payroll_run_flags').select('id, flag_key, flag_type, severity, message, details, toast_name, location_id, resolved_at, resolution_note, resolver:profiles!payroll_run_flags_resolved_by_fkey(full_name, email)').eq('run_id', runId).order('severity').order('created_at'),
  ]);
  return {
    files: must(files) as RunFileRow[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (must(lines) as any[]).map(({ editor, ...l }) => ({ ...l, hours_hh: Number(l.hours_hh), amount_cents: Number(l.amount_cents), edited_by_name: who(editor) })) as LineRow[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flags: (must(flags) as any[]).map(({ resolver, ...f }) => ({ ...f, resolved_by_name: who(resolver) })) as FlagRow[],
  };
}

export const toPayLine = (l: LineRow): PayLine => ({
  id: l.id, employeeId: l.employee_id, toastName: l.toast_name, toastEmployeeId: l.toast_employee_id,
  locationId: l.location_id, jobTitle: l.job_title, earningType: l.earning_type, hoursHh: l.hours_hh,
  rateCents: l.rate_cents, amountCents: l.amount_cents, source: l.source, adjustmentReason: l.adjustment_reason, editedAt: l.edited_at,
});

/** Engine inputs for a run: its files, their parsed rows, and duplicate detection across runs. */
export async function loadEngineFiles(supabase: Supabase, runId: string): Promise<EngineFile[]> {
  const [{ data: files, error }, { data: rows, error: rowErr }] = await Promise.all([
    supabase.from('payroll_run_files').select('id, original_name, file_kind, location_id, sha256, control_totals, created_at').eq('run_id', runId),
    supabase.from('payroll_source_rows').select('*').eq('run_id', runId).order('row_number'),
  ]);
  if (error) throw new Error(error.message);
  if (rowErr) throw new Error(rowErr.message);
  const shas = (files ?? []).map((f) => f.sha256);
  const { data: dupes } = shas.length
    ? await supabase.from('payroll_run_files').select('sha256, run_id, run:payroll_runs(period_start, period_end)').in('sha256', shas).neq('run_id', runId)
    : { data: [] };

  return (files ?? []).map((f) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dupe = (dupes ?? []).find((d: any) => d.sha256 === f.sha256) as any;
    return {
      id: f.id,
      name: f.original_name ?? 'file',
      kind: f.file_kind,
      locationId: f.location_id,
      duplicateOf: dupe ? `in the ${dupe.run?.period_start} – ${dupe.run?.period_end} run` : null,
      control: f.control_totals,
      rows: (rows ?? []).filter((r) => r.file_id === f.id).map((r): SourceRow => ({
        rowNumber: r.row_number, toastName: r.toast_name, toastEmployeeId: r.toast_employee_id, jobTitle: r.job_title,
        locationText: null, workDate: r.work_date, regHh: r.reg_hh, otHh: r.ot_hh, rateCents: r.rate_cents,
        regPayCents: r.reg_pay_cents == null ? null : Number(r.reg_pay_cents),
        otPayCents: r.ot_pay_cents == null ? null : Number(r.ot_pay_cents),
        cctipsCents: Number(r.cctips_cents), cashtipsCents: Number(r.cashtips_cents), gratCents: Number(r.grat_cents),
        issues: r.issues ?? [],
      })),
    };
  });
}

async function previousGross(supabase: Supabase, run: RunRow) {
  const { data: prev } = await supabase
    .from('payroll_runs').select('id').lt('period_end', run.period_start).in('status', ['approved', 'exported'])
    .order('period_end', { ascending: false }).limit(1).maybeSingle();
  if (!prev) return null;
  const { lines } = await loadRunDetail(supabase, prev.id);
  return grossByEmployee(lines.map(toPayLine));
}

/** Rebuilds Toast lines (keeping human edits), keeps manual adjustments, and re-runs every check. */
export async function processRun(supabase: Supabase, runId: string): Promise<{ blockers: number; warnings: number }> {
  const run = await loadRun(supabase, runId);
  if (!run) throw new Error('Run not found');
  if (run.status === 'approved' || run.status === 'exported') throw new Error('Run is approved — reopen it to make changes');

  const [config, files, detail, previous] = await Promise.all([
    loadConfig(supabase), loadEngineFiles(supabase, runId), loadRunDetail(supabase, runId), previousGross(supabase, run),
  ]);
  const ctx: EngineContext = { periodStart: run.period_start, periodEnd: run.period_end, ...config, previous };

  // Rebuild Toast lines, carrying forward any human edit to the same line.
  const edited = new Map(detail.lines.filter((l) => l.source === 'toast' && l.edited_at).map((l) => [lineKey(toPayLine({ ...l, rate_cents: (l.original?.rate_cents as number | null) ?? l.rate_cents })), l]));
  const built = buildLines(files, ctx);
  const toastRows = built.map((b) => {
    const e = edited.get(lineKey(b));
    const base = {
      run_id: runId, employee_id: b.employeeId, toast_name: b.toastName, toast_employee_id: b.toastEmployeeId,
      location_id: b.locationId, job_title: b.jobTitle, earning_type: b.earningType, source: 'toast',
    };
    return e
      ? { ...base, hours_hh: e.hours_hh, rate_cents: e.rate_cents, amount_cents: e.amount_cents, adjustment_reason: e.adjustment_reason,
          original: { hours_hh: b.hoursHh, rate_cents: b.rateCents, amount_cents: b.amountCents }, edited_at: e.edited_at }
      : { ...base, hours_hh: b.hoursHh, rate_cents: b.rateCents, amount_cents: b.amountCents };
  });

  must(await supabase.from('payroll_run_lines').delete().eq('run_id', runId).eq('source', 'toast'));
  if (toastRows.length) must(await supabase.from('payroll_run_lines').insert(toastRows));

  const { lines } = await loadRunDetail(supabase, runId);
  const { flags, summaries } = checkRun(lines.map(toPayLine), files, ctx);

  // Keep warning acknowledgments for flags that still apply.
  const prior = new Map(detail.flags.map((f) => [f.flag_key, f]));
  must(await supabase.from('payroll_run_flags').delete().eq('run_id', runId));
  if (flags.length) {
    must(await supabase.from('payroll_run_flags').insert(flags.map((f: Flag) => {
      const p = prior.get(f.key);
      const keep = f.severity === 'warning' && p?.resolved_at && p.severity === 'warning';
      return {
        run_id: runId, flag_key: f.key, flag_type: f.type, severity: f.severity, message: f.message,
        details: f.details ?? null, toast_name: f.toastName ?? null, location_id: f.locationId ?? null,
        ...(keep ? { resolved_at: p!.resolved_at, resolution_note: p!.resolution_note } : {}),
      };
    })));
  }

  must(await supabase.from('payroll_runs').update({
    processed_at: new Date().toISOString(),
    status: run.status === 'draft' ? 'in_review' : run.status,
    totals: { summaries },
  }).eq('id', runId));

  const blockers = flags.filter((f) => f.severity === 'blocker').length;
  await log(supabase, 'process', { lines: lines.length, blockers, warnings: flags.length - blockers }, runId);
  return { blockers, warnings: flags.length - blockers };
}

/** Downloads a stored upload as text (RLS: payroll_access). */
export async function downloadText(supabase: Supabase, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PAYROLL_BUCKET).download(path);
  if (error || !data) throw new Error(`Couldn't read the uploaded file: ${error?.message ?? 'missing'}`);
  return await data.text();
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Server-side parse of an already-sanitized upload. Rejects files that still contain sensitive columns. */
export function parseUpload(text: string, mapping: ColumnMapping, kind: FileKind) {
  if (hasSensitiveColumns(text)) throw new Error('This file still contains sensitive columns (SSN, bank, or address). Upload it through the app so they are removed first.');
  return parseToastCsv(text, { mapping, kind });
}
