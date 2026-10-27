'use server';

import { revalidatePath } from 'next/cache';
import {
  PAYROLL_BUCKET, downloadText, loadConfig, loadRun, loadRunDetail, log, parseUpload, processRun,
  requirePayroll, sha256Hex, toPayLine,
} from '@/lib/payroll/server';
import { buildLines, checkRun, type EngineFile } from '@/lib/payroll/engine';
import { buildOutputRows } from '@/lib/payroll/output';
import { diffOutput, type DiffResult } from '@/lib/payroll/diff';
import { parseCents, parseHundredthsOfHour } from '@/lib/payroll/units';
import { CANONICAL_FIELDS, OUTPUT_SOURCES, type ColumnMapping, type FileKind, type OutputSource } from '@/lib/payroll/types';

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: FileKind[] = ['payroll_export', 'time_entries'];

function fail(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error ? err.message
    : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  console.error('[payroll action]', msg);
  if (/row-level security|permission denied|Not authorized/i.test(msg)) return { ok: false, error: 'You don’t have payroll access.' };
  return { ok: false, error: msg };
}

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return fail(err);
  }
}

function cleanMapping(m: ColumnMapping): ColumnMapping {
  const out: ColumnMapping = {};
  for (const f of CANONICAL_FIELDS) if (typeof m?.[f] === 'string' && m[f]!.trim()) out[f] = m[f]!.slice(0, 200);
  return out;
}

function hoursInput(v: string, label = 'Hours'): number {
  const p = parseHundredthsOfHour(v);
  if (p.invalid || p.rounded) throw new Error(`${label} must be a number with up to 2 decimals.`);
  return p.value ?? 0;
}
function centsInput(v: string, label: string, allowEmpty = false): number | null {
  const p = parseCents(v);
  if (p.invalid || p.rounded) throw new Error(`${label} must be a dollar amount with up to 2 decimals.`);
  if (p.value === null && !allowEmpty) return 0;
  return p.value;
}
const requireReason = (r: string) => {
  const t = (r ?? '').trim();
  if (t.length < 3) throw new Error('A reason is required.');
  return t.slice(0, 500);
};

const revalidateRun = (runId?: string) => {
  revalidatePath('/payroll', 'layout');
  if (runId) revalidatePath(`/payroll/runs/${runId}`);
};

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function createRun(input: { periodStart: string; periodEnd: string; notes: string }): Promise<Result<{ id: string }>> {
  return guard(async () => {
    if (!DATE.test(input.periodStart) || !DATE.test(input.periodEnd) || input.periodEnd < input.periodStart) throw new Error('Enter a valid pay period.');
    const { supabase } = await requirePayroll();
    const { data, error } = await supabase.from('payroll_runs')
      .insert({ period_start: input.periodStart, period_end: input.periodEnd, notes: input.notes?.trim() || null })
      .select('id').single();
    if (error) throw error;
    await log(supabase, 'create_run', { period_start: input.periodStart, period_end: input.periodEnd }, data.id);
    revalidateRun();
    return { id: data.id as string };
  });
}

export interface RegisterFileInput {
  storagePath: string;
  originalName: string;
  kind: FileKind;
  locationId: string | null;
  mapping: ColumnMapping;
  signature: string;
  droppedColumns: string[];
}

export async function registerRunFile(runId: string, input: RegisterFileInput): Promise<Result<{ rows: number }>> {
  return guard(async () => {
    if (!UUID.test(runId) || !input.storagePath.startsWith(`runs/${runId}/`) || input.storagePath.includes('..')) throw new Error('Invalid upload.');
    if (!KINDS.includes(input.kind)) throw new Error('Choose the file type.');
    if (input.locationId && !UUID.test(input.locationId)) throw new Error('Invalid location.');
    const { supabase } = await requirePayroll();
    const mapping = cleanMapping(input.mapping);
    const text = await downloadText(supabase, input.storagePath);
    let parsed;
    try {
      parsed = parseUpload(text, mapping, input.kind);
    } catch (err) {
      await supabase.storage.from(PAYROLL_BUCKET).remove([input.storagePath]);
      throw err;
    }
    if (!mapping.employee_name && !(mapping.first_name && mapping.last_name)) throw new Error('Map the employee name column.');
    const sha = sha256Hex(text);

    const { data: file, error } = await supabase.from('payroll_run_files').insert({
      run_id: runId, storage_path: input.storagePath, original_name: input.originalName.slice(0, 200), file_kind: input.kind,
      location_id: input.locationId, sha256: sha, row_count: parsed.rows.length, control_totals: parsed.control,
      column_mapping: mapping, dropped_columns: input.droppedColumns.slice(0, 50),
    }).select('id').single();
    if (error) {
      await supabase.storage.from(PAYROLL_BUCKET).remove([input.storagePath]);
      if (error.code === '23505') throw new Error(`“${input.originalName}” is already in this run.`);
      throw error;
    }
    if (parsed.rows.length) {
      const { error: rowErr } = await supabase.from('payroll_source_rows').insert(parsed.rows.map((r) => ({
        run_id: runId, file_id: file.id, file_kind: input.kind, location_id: input.locationId, row_number: r.rowNumber,
        toast_name: r.toastName, toast_employee_id: r.toastEmployeeId, job_title: r.jobTitle, work_date: r.workDate,
        reg_hh: r.regHh, ot_hh: r.otHh, rate_cents: r.rateCents, reg_pay_cents: r.regPayCents, ot_pay_cents: r.otPayCents,
        cctips_cents: r.cctipsCents, cashtips_cents: r.cashtipsCents, grat_cents: r.gratCents, issues: r.issues,
      })));
      if (rowErr) {
        await supabase.from('payroll_run_files').delete().eq('id', file.id);
        throw rowErr;
      }
    }
    await supabase.from('payroll_column_mappings').upsert(
      { header_signature: input.signature.slice(0, 2000), file_kind: input.kind, mapping },
      { onConflict: 'header_signature' },
    );
    await log(supabase, 'upload', { file: input.originalName, kind: input.kind, rows: parsed.rows.length, sha256: sha, dropped_columns: input.droppedColumns }, runId, 'payroll_run_files', file.id);
    revalidateRun(runId);
    return { rows: parsed.rows.length };
  });
}

export async function updateRunFile(fileId: string, input: { locationId: string | null }): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(fileId) || (input.locationId && !UUID.test(input.locationId))) throw new Error('Invalid file.');
    const { supabase } = await requirePayroll();
    const { data: file, error } = await supabase.from('payroll_run_files').update({ location_id: input.locationId }).eq('id', fileId).select('run_id').single();
    if (error) throw error;
    const { error: rowErr } = await supabase.from('payroll_source_rows').update({ location_id: input.locationId }).eq('file_id', fileId);
    if (rowErr) throw rowErr;
    await log(supabase, 'set_file_location', { file_id: fileId, location_id: input.locationId }, file.run_id);
    await processRun(supabase, file.run_id);
    revalidateRun(file.run_id);
    return null;
  });
}

export async function removeRunFile(fileId: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(fileId)) throw new Error('Invalid file.');
    const { supabase } = await requirePayroll();
    const { data: file, error } = await supabase.from('payroll_run_files').select('run_id, storage_path, original_name').eq('id', fileId).single();
    if (error) throw error;
    const { error: delErr } = await supabase.from('payroll_run_files').delete().eq('id', fileId);
    if (delErr) throw delErr;
    await supabase.storage.from(PAYROLL_BUCKET).remove([file.storage_path]);
    await log(supabase, 'remove_file', { file: file.original_name }, file.run_id);
    await processRun(supabase, file.run_id);
    revalidateRun(file.run_id);
    return null;
  });
}

export async function processRunAction(runId: string): Promise<Result<{ blockers: number; warnings: number }>> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    const { supabase } = await requirePayroll();
    const res = await processRun(supabase, runId);
    revalidateRun(runId);
    return res;
  });
}

export async function editLine(lineId: string, input: { hours: string; rate: string; amount: string; reason: string }): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(lineId)) throw new Error('Invalid line.');
    const reason = requireReason(input.reason);
    const { supabase, userId } = await requirePayroll();
    const { data: line, error } = await supabase.from('payroll_run_lines').select('run_id, hours_hh, rate_cents, amount_cents, original').eq('id', lineId).single();
    if (error) throw error;
    const { error: upErr } = await supabase.from('payroll_run_lines').update({
      hours_hh: hoursInput(input.hours),
      rate_cents: centsInput(input.rate, 'Rate', true),
      amount_cents: centsInput(input.amount, 'Amount'),
      adjustment_reason: reason,
      original: line.original ?? { hours_hh: line.hours_hh, rate_cents: line.rate_cents, amount_cents: Number(line.amount_cents) },
      edited_by: userId,
      edited_at: new Date().toISOString(),
    }).eq('id', lineId);
    if (upErr) throw upErr;
    await processRun(supabase, line.run_id);
    revalidateRun(line.run_id);
    return null;
  });
}

export interface AdjustmentInput {
  employeeId: string | null;
  toastName: string;
  locationId: string | null;
  jobTitle: string;
  earningType: string;
  hours: string;
  rate: string;
  amount: string;
  reason: string;
}

export async function addAdjustment(runId: string, input: AdjustmentInput): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    if (input.employeeId && !UUID.test(input.employeeId)) throw new Error('Invalid employee.');
    if (input.locationId && !UUID.test(input.locationId)) throw new Error('Invalid location.');
    const reason = requireReason(input.reason);
    const { supabase, userId } = await requirePayroll();
    const { data: pc } = await supabase.from('payroll_paycode_map').select('earning_type').eq('earning_type', input.earningType).maybeSingle();
    if (!pc) throw new Error('Choose an earning code.');
    const name = input.toastName.trim();
    if (!name) throw new Error('Choose an employee.');
    const { error } = await supabase.from('payroll_run_lines').insert({
      run_id: runId, employee_id: input.employeeId, toast_name: name, location_id: input.locationId,
      job_title: input.jobTitle.trim() || null, earning_type: input.earningType,
      hours_hh: hoursInput(input.hours), rate_cents: centsInput(input.rate, 'Rate', true), amount_cents: centsInput(input.amount, 'Amount'),
      source: 'manual_adjustment', adjustment_reason: reason, created_by: userId,
    });
    if (error) throw error;
    await processRun(supabase, runId);
    revalidateRun(runId);
    return null;
  });
}

export async function deleteAdjustment(lineId: string, reason: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(lineId)) throw new Error('Invalid line.');
    const why = requireReason(reason);
    const { supabase } = await requirePayroll();
    const { data: line, error } = await supabase.from('payroll_run_lines').select('run_id, source').eq('id', lineId).single();
    if (error) throw error;
    if (line.source !== 'manual_adjustment') throw new Error('Only manual adjustments can be removed. Edit Toast lines instead.');
    await log(supabase, 'remove_adjustment_reason', { line_id: lineId, reason: why }, line.run_id);
    const { error: delErr } = await supabase.from('payroll_run_lines').delete().eq('id', lineId);
    if (delErr) throw delErr;
    await processRun(supabase, line.run_id);
    revalidateRun(line.run_id);
    return null;
  });
}

export async function acknowledgeFlag(flagId: string, note: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(flagId)) throw new Error('Invalid flag.');
    const why = requireReason(note);
    const { supabase, userId } = await requirePayroll();
    const { data: flag, error } = await supabase.from('payroll_run_flags')
      .update({ resolved_by: userId, resolved_at: new Date().toISOString(), resolution_note: why })
      .eq('id', flagId).eq('severity', 'warning').select('run_id, flag_key').single();
    if (error) throw new Error(error.code === 'PGRST116' ? 'Blockers can’t be acknowledged — fix the underlying issue.' : error.message);
    await log(supabase, 'acknowledge_warning', { flag: flag.flag_key, note: why }, flag.run_id);
    revalidateRun(flag.run_id);
    return null;
  });
}

export async function addTipCreditMakeup(flagId: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(flagId)) throw new Error('Invalid flag.');
    const { supabase } = await requirePayroll();
    const { data: flag, error } = await supabase.from('payroll_run_flags').select('run_id, toast_name, details, flag_type').eq('id', flagId).single();
    if (error) throw error;
    const d = (flag.details ?? {}) as { suggestedCents?: number; employeeId?: string | null; locationId?: string | null; jobTitle?: string | null };
    if (flag.flag_type !== 'tip_credit_shortfall' || !d.suggestedCents) throw new Error('No suggestion on this flag.');
    const cents = d.suggestedCents;
    const res = await addAdjustment(flag.run_id, {
      employeeId: d.employeeId ?? null, toastName: flag.toast_name ?? '', locationId: d.locationId ?? null, jobTitle: d.jobTitle ?? '',
      earningType: 'TIPCREDIT_MAKEUP', hours: '0', rate: '', amount: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`,
      reason: 'Tip credit make-up to Ohio minimum wage (suggested by check)',
    });
    if (!res.ok) throw new Error(res.error);
    return null;
  });
}

export async function approveRun(runId: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    const { supabase } = await requirePayroll();
    const { blockers } = await processRun(supabase, runId);
    if (blockers > 0) throw new Error(`Cannot approve: ${blockers} blocker(s) still open.`);
    const run = await loadRun(supabase, runId);
    const { error } = await supabase.from('payroll_runs').update({ status: 'approved', totals: run?.totals }).eq('id', runId);
    if (error) throw error;
    revalidateRun(runId);
    return null;
  });
}

export async function reopenRun(runId: string, reason: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    const why = requireReason(reason);
    const { supabase } = await requirePayroll();
    await log(supabase, 'reopen_reason', { reason: why }, runId);
    const { error } = await supabase.from('payroll_runs').update({ status: 'in_review' }).eq('id', runId);
    if (error) throw error;
    revalidateRun(runId);
    return null;
  });
}

export async function deleteDraftRun(runId: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    const { supabase } = await requirePayroll();
    const run = await loadRun(supabase, runId);
    if (!run || run.status === 'approved' || run.status === 'exported') throw new Error('Only unapproved runs can be deleted.');
    const { files } = await loadRunDetail(supabase, runId);
    const { error } = await supabase.from('payroll_runs').delete().eq('id', runId);
    if (error) throw error;
    if (files.length) await supabase.storage.from(PAYROLL_BUCKET).remove(files.map((f) => f.storage_path));
    await log(supabase, 'delete_run', { period_start: run.period_start, period_end: run.period_end }, runId);
    revalidateRun();
    return null;
  });
}

export async function getOutputPreview(runId: string): Promise<Result<{ headers: string[]; rows: string[][] }>> {
  return guard(async () => {
    if (!UUID.test(runId)) throw new Error('Invalid run.');
    const { supabase } = await requirePayroll();
    const [run, config, detail] = await Promise.all([loadRun(supabase, runId), loadConfig(supabase), loadRunDetail(supabase, runId)]);
    if (!run) throw new Error('Run not found');
    return buildOutputRows(detail.lines.map(toPayLine), { periodStart: run.period_start, periodEnd: run.period_end, ...config });
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export interface EmployeeInput {
  toast_name: string;
  toast_employee_id: string;
  paycom_employee_code: string;
  first_name: string;
  last_name: string;
  primary_location_id: string;
  active: boolean;
  notes: string;
}

export async function saveEmployee(id: string | null, input: EmployeeInput): Promise<Result<{ id: string }>> {
  return guard(async () => {
    if (id && !UUID.test(id)) throw new Error('Invalid employee.');
    if (!text(input.toast_name)) throw new Error('Toast name is required.');
    const { supabase } = await requirePayroll();
    const row = {
      toast_name: text(input.toast_name)!, toast_employee_id: text(input.toast_employee_id), paycom_employee_code: text(input.paycom_employee_code),
      first_name: text(input.first_name), last_name: text(input.last_name),
      primary_location_id: input.primary_location_id && UUID.test(input.primary_location_id) ? input.primary_location_id : null,
      active: !!input.active, notes: text(input.notes, 1000),
    };
    const q = id ? supabase.from('payroll_employees').update(row).eq('id', id) : supabase.from('payroll_employees').insert(row);
    const { data, error } = await q.select('id').single();
    if (error) throw new Error(error.code === '23505' ? 'That Toast employee or Paycom code is already mapped.' : error.message);
    revalidateRun();
    return { id: data.id as string };
  });
}

export async function deleteEmployee(id: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(id)) throw new Error('Invalid employee.');
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_employees').delete().eq('id', id);
    if (error) throw error;
    revalidateRun();
    return null;
  });
}

export async function importRoster(rows: { code: string; first: string; last: string; department: string; location: string }[]): Promise<Result<{ imported: number }>> {
  return guard(async () => {
    if (!Array.isArray(rows) || rows.length > 2000) throw new Error('Roster is too large.');
    const clean = rows
      .map((r) => ({ paycom_employee_code: text(r.code, 50), first_name: text(r.first, 100), last_name: text(r.last, 100), department_code: text(r.department, 50), location_code: text(r.location, 50) }))
      .filter((r) => r.paycom_employee_code);
    if (!clean.length) throw new Error('No employee codes found in that roster.');
    const unique = [...new Map(clean.map((r) => [r.paycom_employee_code, r])).values()];
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_paycom_roster').upsert(unique, { onConflict: 'paycom_employee_code' });
    if (error) throw error;
    await log(supabase, 'import_roster', { rows: unique.length }, null, 'payroll_paycom_roster');
    revalidateRun();
    return { imported: unique.length };
  });
}

export interface JobInput { location_id: string; toast_job_title: string; paycom_department_code: string; paycom_position_code: string; is_tipped: boolean; notes: string }

export async function saveJob(id: string | null, input: JobInput): Promise<Result> {
  return guard(async () => {
    if (id && !UUID.test(id)) throw new Error('Invalid job.');
    if (!text(input.toast_job_title)) throw new Error('Toast job title is required.');
    const { supabase } = await requirePayroll();
    const row = {
      location_id: input.location_id && UUID.test(input.location_id) ? input.location_id : null,
      toast_job_title: text(input.toast_job_title)!, paycom_department_code: text(input.paycom_department_code, 50),
      paycom_position_code: text(input.paycom_position_code, 50), is_tipped: !!input.is_tipped, notes: text(input.notes, 500),
    };
    const { error } = id ? await supabase.from('payroll_job_map').update(row).eq('id', id) : await supabase.from('payroll_job_map').insert(row);
    if (error) throw new Error(error.code === '23505' ? 'That job is already mapped for this location.' : error.message);
    revalidateRun();
    return null;
  });
}

export async function deleteJob(id: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(id)) throw new Error('Invalid job.');
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_job_map').delete().eq('id', id);
    if (error) throw error;
    revalidateRun();
    return null;
  });
}

export interface PaycodeInput { earning_type: string; paycom_earning_code: string; description: string; kind: 'hours' | 'amount'; manual_only: boolean; sort_order: number }

export async function savePaycode(id: string | null, input: PaycodeInput): Promise<Result> {
  return guard(async () => {
    if (id && !UUID.test(id)) throw new Error('Invalid pay code.');
    const et = text(input.earning_type, 40)?.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!et) throw new Error('Earning type is required.');
    const { supabase } = await requirePayroll();
    const row = {
      earning_type: et, paycom_earning_code: text(input.paycom_earning_code, 50), description: text(input.description, 200),
      kind: input.kind === 'hours' ? 'hours' : 'amount', manual_only: !!input.manual_only,
      sort_order: Number.isSafeInteger(input.sort_order) ? input.sort_order : 0,
    };
    const { error } = id ? await supabase.from('payroll_paycode_map').update(row).eq('id', id) : await supabase.from('payroll_paycode_map').insert(row);
    if (error) throw new Error(error.code === '23505' ? 'That earning type already exists.' : error.message);
    revalidateRun();
    return null;
  });
}

export interface LocationInput { name: string; toast_location_name: string; paycom_location_code: string; paycom_department_code: string; active: boolean; sort_order: number }

export async function saveLocation(id: string | null, input: LocationInput): Promise<Result> {
  return guard(async () => {
    if (id && !UUID.test(id)) throw new Error('Invalid location.');
    if (!text(input.name)) throw new Error('Name is required.');
    const { supabase } = await requirePayroll();
    const row = {
      name: text(input.name)!, toast_location_name: text(input.toast_location_name), paycom_location_code: text(input.paycom_location_code, 50),
      paycom_department_code: text(input.paycom_department_code, 50), active: !!input.active,
      sort_order: Number.isSafeInteger(input.sort_order) ? input.sort_order : 0,
    };
    const { error } = id ? await supabase.from('payroll_locations').update(row).eq('id', id) : await supabase.from('payroll_locations').insert(row);
    if (error) throw new Error(error.code === '23505' ? 'That location name already exists.' : error.message);
    revalidateRun();
    return null;
  });
}

export interface TemplateInput {
  name: string;
  file_type: 'csv' | 'xlsx';
  date_format: string;
  include_rate: boolean;
  columns: { header: string; source: OutputSource }[];
  key_columns: string[];
}

export async function saveTemplate(input: TemplateInput): Promise<Result> {
  return guard(async () => {
    const columns = (input.columns ?? []).map((c) => ({ header: String(c.header ?? '').trim().slice(0, 100), source: c.source }))
      .filter((c) => c.header && OUTPUT_SOURCES.includes(c.source));
    if (!columns.length) throw new Error('Add at least one column.');
    if (!/^[YMD/\-. ]+$/.test(input.date_format) || !/Y/.test(input.date_format)) throw new Error('Date format can use YYYY, YY, MM, M, DD, D and / - . separators.');
    const keys = (input.key_columns ?? []).filter((k) => columns.some((c) => c.header === k));
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_output_template').update({
      name: text(input.name) ?? 'Output template', file_type: input.file_type === 'xlsx' ? 'xlsx' : 'csv',
      date_format: input.date_format, include_rate: !!input.include_rate, columns, key_columns: keys,
    }).eq('id', true);
    if (error) throw error;
    revalidateRun();
    return null;
  });
}

export interface SettingsInput {
  pay_frequency: 'weekly' | 'biweekly' | 'semimonthly';
  workweek_start_dow: number;
  next_period_start: string;
  min_wage: string;
  tipped_cash_wage: string;
  ot_threshold_hours: string;
  alert_weekly_hours: string;
  alert_tips: string;
  big_change_pct: number;
  big_change_min: string;
}

export async function saveSettings(input: SettingsInput): Promise<Result> {
  return guard(async () => {
    if (input.next_period_start && !DATE.test(input.next_period_start)) throw new Error('Invalid next pay period start.');
    const dow = Number(input.workweek_start_dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) throw new Error('Invalid workweek start day.');
    const pct = Number(input.big_change_pct);
    if (!Number.isInteger(pct) || pct <= 0) throw new Error('Big-change percent must be a whole number.');
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_settings').update({
      pay_frequency: input.pay_frequency, workweek_start_dow: dow, next_period_start: input.next_period_start || null,
      min_wage_cents: centsInput(input.min_wage, 'Minimum wage'), tipped_cash_wage_cents: centsInput(input.tipped_cash_wage, 'Tipped cash wage'),
      ot_threshold_hh: hoursInput(input.ot_threshold_hours, 'OT threshold'), alert_weekly_hours_hh: hoursInput(input.alert_weekly_hours, 'Weekly hours alert'),
      alert_tips_cents: centsInput(input.alert_tips, 'Tips alert'), big_change_pct: pct, big_change_min_cents: centsInput(input.big_change_min, 'Big-change minimum'),
    }).eq('id', true);
    if (error) throw error;
    revalidateRun();
    return null;
  });
}

// ─── Examples harness ─────────────────────────────────────────────────────────

export interface ExampleFile { path: string; name: string; kind: FileKind; locationId: string | null; mapping: ColumnMapping }

export async function createExample(input: { name: string; periodStart: string; periodEnd: string; notes: string }): Promise<Result<{ id: string }>> {
  return guard(async () => {
    if (!text(input.name)) throw new Error('Name the example.');
    if (!DATE.test(input.periodStart) || !DATE.test(input.periodEnd)) throw new Error('Enter the pay period.');
    const { supabase } = await requirePayroll();
    const { data, error } = await supabase.from('payroll_examples')
      .insert({ name: text(input.name), period_start: input.periodStart, period_end: input.periodEnd, notes: text(input.notes, 4000) })
      .select('id').single();
    if (error) throw error;
    await log(supabase, 'create_example', { name: input.name }, null, 'payroll_examples', data.id);
    return { id: data.id as string };
  });
}

export async function attachExampleFiles(id: string, input: { toastFiles: ExampleFile[]; expected: { path: string; name: string } }): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(id)) throw new Error('Invalid example.');
    const prefix = `examples/${id}/`;
    const files = input.toastFiles.map((f) => ({ path: f.path, name: f.name.slice(0, 200), kind: f.kind, locationId: f.locationId && UUID.test(f.locationId) ? f.locationId : null, mapping: cleanMapping(f.mapping) }));
    if (!files.length || files.some((f) => !f.path.startsWith(prefix) || f.path.includes('..') || !KINDS.includes(f.kind))) throw new Error('Invalid example files.');
    if (!input.expected?.path?.startsWith(prefix) || input.expected.path.includes('..')) throw new Error('Upload the finished Paycom file.');
    const { supabase } = await requirePayroll();
    const { error } = await supabase.from('payroll_examples').update({ toast_files: files, expected_path: input.expected.path, expected_name: input.expected.name.slice(0, 200) }).eq('id', id);
    if (error) throw error;
    revalidateRun();
    return null;
  });
}

async function runOneExample(supabase: Awaited<ReturnType<typeof requirePayroll>>['supabase'], id: string): Promise<DiffResult & { name: string }> {
  const { data: ex, error } = await supabase.from('payroll_examples').select('*').eq('id', id).single();
  if (error) throw error;
  if (!ex.expected_path || !(ex.toast_files ?? []).length) throw new Error(`“${ex.name}” is missing its files.`);
  const config = await loadConfig(supabase);
  const files: EngineFile[] = [];
  for (const [i, f] of (ex.toast_files as ExampleFile[]).entries()) {
    const parsed = parseUpload(await downloadText(supabase, f.path), f.mapping, f.kind);
    files.push({ id: `example-${i}`, name: f.name, kind: f.kind, locationId: f.locationId, duplicateOf: null, control: parsed.control, rows: parsed.rows });
  }
  const ctx = { periodStart: ex.period_start, periodEnd: ex.period_end, ...config, previous: null };
  const lines = buildLines(files, ctx);
  checkRun(lines, files, ctx);
  const output = buildOutputRows(lines, ctx);
  const result = diffOutput(output, await downloadText(supabase, ex.expected_path), config.template.key_columns);
  await supabase.from('payroll_examples').update({
    last_result: { ...result, ran_at: new Date().toISOString() }, last_run_at: new Date().toISOString(),
  }).eq('id', id);
  await log(supabase, 'run_example', { example: ex.name, match_pct: result.matchPct }, null, 'payroll_examples', id);
  return { ...result, name: ex.name };
}

export async function runExample(id: string): Promise<Result<DiffResult>> {
  return guard(async () => {
    if (!UUID.test(id)) throw new Error('Invalid example.');
    const { supabase } = await requirePayroll();
    const res = await runOneExample(supabase, id);
    revalidatePath('/payroll/examples', 'layout');
    return res;
  });
}

export async function runAllExamples(): Promise<Result<{ id: string; name: string; matchPct: number | null; error?: string }[]>> {
  return guard(async () => {
    const { supabase } = await requirePayroll();
    const { data: all, error } = await supabase.from('payroll_examples').select('id, name').order('created_at');
    if (error) throw error;
    const out: { id: string; name: string; matchPct: number | null; error?: string }[] = [];
    for (const ex of all ?? []) {
      try {
        const r = await runOneExample(supabase, ex.id);
        out.push({ id: ex.id, name: ex.name, matchPct: r.matchPct });
      } catch (err) {
        out.push({ id: ex.id, name: ex.name, matchPct: null, error: err instanceof Error ? err.message : String(err) });
      }
    }
    revalidatePath('/payroll/examples', 'layout');
    return out;
  });
}

export async function deleteExample(id: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(id)) throw new Error('Invalid example.');
    const { supabase } = await requirePayroll();
    const { data: ex, error } = await supabase.from('payroll_examples').select('name, toast_files, expected_path').eq('id', id).single();
    if (error) throw error;
    const paths = [...((ex.toast_files ?? []) as ExampleFile[]).map((f) => f.path), ex.expected_path].filter(Boolean) as string[];
    const { error: delErr } = await supabase.from('payroll_examples').delete().eq('id', id);
    if (delErr) throw delErr;
    if (paths.length) await supabase.storage.from(PAYROLL_BUCKET).remove(paths);
    await log(supabase, 'delete_example', { name: ex.name }, null, 'payroll_examples', id);
    revalidatePath('/payroll/examples', 'layout');
    return null;
  });
}
