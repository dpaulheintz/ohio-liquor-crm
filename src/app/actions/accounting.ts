'use server';

// Accounting server actions. Every call runs as the signed-in user (RLS: has_accounting_access()),
// after an explicit access check. Money crosses the wire as integer cents or decimal strings.
import { revalidatePath } from 'next/cache';
import { audit, loadAll, loadReference, recalcReview, requireAccounting } from '@/lib/fin/server';
import { parseWorkbook } from '@/lib/fin/parse';
import { analyze, commitPayload, type Analysis, type Mapping } from '@/lib/fin/resolve';
import { ACCOUNTING_PATH, FIN_BUCKET, SECTIONS, aliasKey, entityKey, toCents, type Section, type Thresholds } from '@/lib/fin/shared';

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const PERIOD = /^\d{4}-\d{2}-01$/;
const GL = /^\d{3,6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(err: unknown): { ok: false; error: string } {
  const msg = err instanceof Error ? err.message
    : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);
  console.error('[accounting action]', msg);
  if (/row-level security|permission denied|Not authorized/i.test(msg)) return { ok: false, error: 'You don’t have accounting access.' };
  return { ok: false, error: msg };
}
async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; } catch (err) { return fail(err); }
}
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const refresh = () => revalidatePath(ACCOUNTING_PATH, 'layout');
const text = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface DiffRow { entity: string; gl: string; name: string; from: number | null; to: number | null }
export interface UploadAnalysis {
  storagePath: string;
  fileName: string;
  sheets: string[];
  sheetName: string;
  period: string;
  periodStatus: 'open' | 'closed' | 'new';
  analysis: Omit<Analysis, 'lines' | 'totals' | 'subtotals'> & { lineCount: number };
  diff: { added: DiffRow[]; removed: DiffRow[]; changed: DiffRow[]; hasPrevious: boolean } | null;
  currentVersion: number | null;
}

async function readUpload(storagePath: string) {
  if (!storagePath.startsWith('uploads/') || storagePath.includes('..')) throw new Error('Invalid upload.');
  const { supabase, userId } = await requireAccounting();
  const { data, error } = await supabase.storage.from(FIN_BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Could not read the uploaded file: ${error?.message ?? 'missing'}`);
  return { supabase, userId, buf: Buffer.from(await data.arrayBuffer()) };
}

function periodFromInputs(periodEnding: string | null, sheetName: string, chosen: string | null): string {
  if (chosen && PERIOD.test(chosen)) return chosen;
  if (periodEnding) return `${periodEnding.slice(0, 7)}-01`;
  const m = sheetName.match(/(\d{1,2})\.(\d{4})/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  throw new Error('Could not tell which month this export is for. Pick the month.');
}

/** Parse + map + check an uploaded export, and diff it against what's stored for that month. Writes nothing. */
export async function analyzeUpload(input: { storagePath: string; fileName: string; sheetName?: string; period?: string; mappings?: Record<string, Mapping> }): Promise<Result<UploadAnalysis>> {
  return guard(async () => {
    const { supabase, buf } = await readUpload(input.storagePath);
    const ref = await loadReference(supabase);
    const { sheet, sheets } = await parseWorkbook(buf, ref.entities.filter((e) => e.active), input.sheetName);
    const period = periodFromInputs(sheet.periodEnding, sheet.sheetName, input.period ?? null);
    const a = analyze(sheet, { entities: ref.entities.filter((e) => e.active), accounts: ref.accounts, aliases: ref.aliases, period }, cleanMappings(input.mappings));

    const status = ref.periods.find((p) => p.period === period)?.status ?? 'new';
    const { data: cur } = await supabase.from('fin_uploads').select('version').eq('period', period).eq('status', 'current').maybeSingle();
    let diff: UploadAnalysis['diff'] = null;
    if (a.ok) {
      const { data: stored, error } = await supabase.from('fin_lines').select('entity_code, gl_number, amount').eq('period', period).range(0, 4999);
      if (error) throw new Error(error.message);
      const names = new Map([...ref.accounts.map((x) => [x.gl_number, x.name] as const), ...a.newAccounts.map((x) => [x.gl_number, x.name] as const)]);
      const old = new Map((stored ?? []).map((r) => [`${r.entity_code}|${r.gl_number}`, toCents(r.amount)]));
      const now = new Map(a.lines.map((l) => [`${l.entity}|${l.gl}`, l.cents]));
      const row = (k: string, from: number | null, to: number | null): DiffRow => {
        const [entity, gl] = k.split('|');
        return { entity, gl, name: names.get(gl) ?? '', from, to };
      };
      diff = { added: [], removed: [], changed: [], hasPrevious: (stored ?? []).length > 0 };
      for (const [k, c] of now) { if (!old.has(k)) diff.added.push(row(k, null, c)); else if (old.get(k) !== c) diff.changed.push(row(k, old.get(k)!, c)); }
      for (const [k, c] of old) if (!now.has(k)) diff.removed.push(row(k, c, null));
      const order = (x: DiffRow, y: DiffRow) => x.entity.localeCompare(y.entity) || x.gl.localeCompare(y.gl);
      diff.added.sort(order); diff.removed.sort(order); diff.changed.sort(order);
    }
    const { lines, totals: _t, subtotals: _s, ...rest } = a;
    void _t; void _s;
    return {
      storagePath: input.storagePath, fileName: input.fileName, sheets, sheetName: sheet.sheetName, period,
      periodStatus: status, analysis: { ...rest, lineCount: lines.length }, diff, currentVersion: cur?.version ?? null,
    };
  });
}

function cleanMappings(m: Record<string, Mapping> | undefined): Record<string, Mapping> {
  const out: Record<string, Mapping> = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    if (!/^[a-z0-9]{1,120}$/.test(k) || !v) continue;
    if ('gl' in v && GL.test(v.gl)) out[k] = { gl: v.gl };
    else if ('create' in v && v.create && GL.test(v.create.gl) && (SECTIONS as readonly string[]).includes(v.create.section) && text(v.create.name, 120))
      out[k] = { create: { gl: v.create.gl, name: text(v.create.name, 120), section: v.create.section as Section } };
  }
  return out;
}

/** Commit an upload. The database re-runs every check to the cent before writing. */
export async function commitUpload(input: { storagePath: string; fileName: string; sheetName: string; period: string; mappings?: Record<string, Mapping> }): Promise<Result<{ version: number; changed: number; added: number; removed: number }>> {
  return guard(async () => {
    if (!PERIOD.test(input.period)) throw new Error('Invalid month.');
    const { supabase, buf } = await readUpload(input.storagePath);
    const ref = await loadReference(supabase);
    const active = ref.entities.filter((e) => e.active);
    const { sheet } = await parseWorkbook(buf, active, input.sheetName);
    const a = analyze(sheet, { entities: active, accounts: ref.accounts, aliases: ref.aliases, period: input.period }, cleanMappings(input.mappings));
    if (!a.ok) throw new Error(a.unmapped.length ? `${a.unmapped.length} account(s) still need mapping.` : `Checks failed: ${a.checks.filter((c) => !c.pass).map((c) => c.label).join(', ')}`);
    const res = must(await supabase.rpc('fin_commit_upload', {
      p: commitPayload(a, { period: input.period, file_path: input.storagePath, file_name: input.fileName.slice(0, 200), source: 'upload' }),
    })) as { version: number; diff: { added: unknown[]; removed: unknown[]; changed: unknown[] } };
    await recalcReview(supabase, await loadAll(supabase));
    refresh();
    return { version: res.version, changed: res.diff.changed.length, added: res.diff.added.length, removed: res.diff.removed.length };
  });
}

/** Remove an uploaded file that was never committed (cancel on the upload screen). */
export async function discardUpload(storagePath: string): Promise<Result> {
  return guard(async () => {
    if (!storagePath.startsWith('uploads/') || storagePath.includes('..')) throw new Error('Invalid upload.');
    const { supabase } = await requireAccounting();
    const { count } = await supabase.from('fin_uploads').select('id', { count: 'exact', head: true }).eq('file_path', storagePath);
    if (!count) await supabase.storage.from(FIN_BUCKET).remove([storagePath]);
    return null;
  });
}

// ─── Review: flags + checklist ────────────────────────────────────────────────

export async function setFlagStatus(id: string, status: 'open' | 'explained' | 'resolved', note: string): Promise<Result> {
  return guard(async () => {
    if (!UUID.test(id) || !['open', 'explained', 'resolved'].includes(status)) throw new Error('Invalid flag.');
    const n = text(note);
    if (status !== 'open' && !n) throw new Error('Add a note explaining it.');
    const { supabase, userId } = await requireAccounting();
    const row = must(await supabase.from('fin_flags').update({ status, note: n || null, noted_by: userId, noted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).select('period, rule_key').single()) as { period: string; rule_key: string };
    await audit(supabase, 'flag_note', row.period, { rule_key: row.rule_key, status, note: n });
    refresh();
    return null;
  });
}

export async function setChecklistItem(input: { period: string; entity: string; gl: string; status: 'missing' | 'posted' | 'not_needed'; note: string }): Promise<Result> {
  return guard(async () => {
    if (!PERIOD.test(input.period) || !GL.test(input.gl) || !/^[A-Z]{1,8}$/.test(input.entity) || !['missing', 'posted', 'not_needed'].includes(input.status)) throw new Error('Invalid item.');
    const n = text(input.note);
    if (input.status === 'not_needed' && !n) throw new Error('Say why it isn’t needed this month.');
    const { supabase, userId } = await requireAccounting();
    must(await supabase.from('fin_checklist').update({ status: input.status, note: n || null, updated_by: userId, updated_at: new Date().toISOString() })
      .eq('period', input.period).eq('entity_code', input.entity).eq('gl_number', input.gl).select('period').single());
    await audit(supabase, 'checklist', input.period, { entity: input.entity, gl: input.gl, status: input.status, note: n });
    refresh();
    return null;
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const THRESHOLD_KEYS: (keyof Thresholds)[] = ['mom_pct', 'materiality', 'yoy_pct', 'large_multiple', 'high_priority', 'prime_min', 'prime_max', 'reclass_min', 'reclass_tolerance', 'checklist_window', 'checklist_min_months'];

export async function saveThresholds(input: Record<string, number>): Promise<Result> {
  return guard(async () => {
    const out: Partial<Thresholds> = {};
    for (const k of THRESHOLD_KEYS) {
      const v = Number(input[k]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a positive number.`);
      out[k] = v;
    }
    if (out.prime_min! >= out.prime_max!) throw new Error('Prime cost minimum must be below the maximum.');
    if (out.checklist_min_months! > out.checklist_window!) throw new Error('Checklist months can’t exceed the window.');
    const { supabase } = await requireAccounting();
    must(await supabase.from('fin_settings').upsert({ key: 'thresholds', value: out }));
    await audit(supabase, 'settings_thresholds', null, out as Record<string, unknown>);
    refresh();
    return null;
  });
}

export async function saveEntity(input: { code: string; name: string; aliases: string[]; prime_cost_check: boolean; prime_min: number | null; prime_max: number | null; toast_location_id: string | null; active: boolean; sort_order: number }, isNew = false): Promise<Result> {
  return guard(async () => {
    const code = text(input.code, 8).toUpperCase();
    if (!/^[A-Z]{1,8}$/.test(code) || code === 'TOTAL') throw new Error('Code must be 1–8 letters.');
    const name = text(input.name, 80);
    if (!name) throw new Error('Name is required.');
    const aliases = [...new Set((input.aliases ?? []).map((a) => text(a, 120)).filter(Boolean))];
    const pm = input.prime_min == null || (input.prime_min as unknown) === '' ? null : Number(input.prime_min);
    const px = input.prime_max == null || (input.prime_max as unknown) === '' ? null : Number(input.prime_max);
    if ((pm !== null && !(pm >= 0 && pm <= 1)) || (px !== null && !(px >= 0 && px <= 1)) || (pm !== null && px !== null && pm >= px)) throw new Error('Prime range is a fraction, min below max (e.g. 0.55 – 0.68).');
    const toast = input.toast_location_id && UUID.test(input.toast_location_id) ? input.toast_location_id : null;
    const { supabase } = await requireAccounting();
    const { entities } = await loadReference(supabase);
    const keys = new Map<string, string>();
    for (const e of entities) if (e.code !== code) for (const k of [e.name, ...e.aliases]) keys.set(entityKey(k), e.code);
    for (const k of [name, ...aliases]) if (keys.has(entityKey(k))) throw new Error(`“${k}” already identifies ${keys.get(entityKey(k))}.`);
    const row = { code, name, aliases, prime_cost_check: !!input.prime_cost_check, prime_min: pm, prime_max: px, toast_location_id: toast, active: !!input.active, sort_order: Math.trunc(Number(input.sort_order) || 0) };
    if (isNew) must(await supabase.from('fin_entities').insert(row).select('code').single());
    else must(await supabase.from('fin_entities').update(row).eq('code', code).select('code').single());
    await audit(supabase, isNew ? 'entity_add' : 'entity_edit', null, row);
    refresh();
    return null;
  });
}

export async function saveAccount(input: { gl_number: string; name: string; section: Section; active: boolean }, isNew = false): Promise<Result> {
  return guard(async () => {
    if (!GL.test(input.gl_number)) throw new Error('GL number must be 3–6 digits.');
    if (!(SECTIONS as readonly string[]).includes(input.section)) throw new Error('Pick a section.');
    const name = text(input.name, 120);
    if (!name) throw new Error('Name is required.');
    const { supabase } = await requireAccounting();
    if (isNew) must(await supabase.from('fin_accounts').insert({ gl_number: input.gl_number, name, section: input.section, active: !!input.active, sort_order: Number(input.gl_number) }).select('gl_number').single());
    else must(await supabase.from('fin_accounts').update({ name, section: input.section, active: !!input.active }).eq('gl_number', input.gl_number).select('gl_number').single());
    // keep the account's own name resolvable as an alias
    await supabase.from('fin_account_aliases').upsert({ alias_key: aliasKey(name), alias: name, gl_number: input.gl_number }, { onConflict: 'alias_key', ignoreDuplicates: true });
    await audit(supabase, isNew ? 'account_add' : 'account_edit', null, { gl_number: input.gl_number, name, section: input.section, active: input.active });
    refresh();
    return null;
  });
}

export async function addAlias(alias: string, gl: string): Promise<Result> {
  return guard(async () => {
    const a = text(alias, 120), key = aliasKey(a);
    if (!key || !GL.test(gl)) throw new Error('Enter a name and an account.');
    const { supabase } = await requireAccounting();
    const { data: existing } = await supabase.from('fin_account_aliases').select('gl_number').eq('alias_key', key).maybeSingle();
    if (existing && existing.gl_number !== gl) throw new Error(`“${a}” already maps to ${existing.gl_number}. Delete that alias first.`);
    must(await supabase.from('fin_account_aliases').upsert({ alias_key: key, alias: a, gl_number: gl }).select('alias_key').single());
    await audit(supabase, 'alias_add', null, { alias: a, gl_number: gl });
    refresh();
    return null;
  });
}

export async function deleteAlias(key: string): Promise<Result> {
  return guard(async () => {
    if (!/^[a-z0-9]{1,120}$/.test(key)) throw new Error('Invalid alias.');
    const { supabase } = await requireAccounting();
    const row = must(await supabase.from('fin_account_aliases').delete().eq('alias_key', key).select('alias, gl_number').single());
    await audit(supabase, 'alias_delete', null, row as unknown as Record<string, unknown>);
    refresh();
    return null;
  });
}

export async function saveCrossCheckMappings(input: { sales_gls: string; dsp_gl: string; dsp_entity: string }): Promise<Result> {
  return guard(async () => {
    const sales = input.sales_gls.split(/[\s,]+/).filter(Boolean);
    if (!sales.length || !sales.every((g) => GL.test(g)) || !GL.test(input.dsp_gl) || !/^[A-Z]{1,8}$/.test(input.dsp_entity)) throw new Error('Use GL numbers (e.g. 4100, 4105) and an entity code.');
    const { supabase } = await requireAccounting();
    const value = { sales_gls: sales, dsp_gl: input.dsp_gl, dsp_entity: input.dsp_entity };
    must(await supabase.from('fin_settings').upsert({ key: 'cross_checks', value }));
    await audit(supabase, 'settings_cross_checks', null, value);
    refresh();
    return null;
  });
}

export async function setPeriodStatus(period: string, status: 'open' | 'closed', note: string): Promise<Result> {
  return guard(async () => {
    if (!PERIOD.test(period)) throw new Error('Invalid month.');
    const { supabase } = await requireAccounting();
    must(await supabase.rpc('fin_set_period_status', { p_period: period, p_status: status, p_note: text(note) }));
    refresh();
    return null;
  });
}
