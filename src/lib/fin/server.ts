// Accounting: server-side access, loading and recalculation. Every read and write runs as the
// signed-in user, so RLS (has_accounting_access()) applies on top of the explicit check here.
import { createHash } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { computeChecklist, computeFlags, type FlagRow } from './flags';
import { indexLines } from './compute';
import {
  DEFAULT_THRESHOLDS, toCents,
  type FinAccount, type FinAlias, type FinEntity, type FinPeriod, type Line, type Thresholds,
} from './shared';

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getAccountingAccess(supabase?: Supabase): Promise<{ allowed: boolean; userId: string | null; email: string | null }> {
  const sb = supabase ?? (await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { allowed: false, userId: null, email: null };
  const { data } = await sb.rpc('has_accounting_access');
  return { allowed: data === true, userId: user.id, email: user.email ?? null };
}

export async function requireAccounting() {
  const supabase = await createClient();
  const access = await getAccountingAccess(supabase);
  if (!access.allowed) throw new Error('Not authorized');
  return { supabase, userId: access.userId! };
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface UploadRow {
  id: string; period: string; version: number; status: 'current' | 'superseded'; source: 'upload' | 'history';
  file_path: string | null; file_name: string | null; sheet_name: string | null;
  detected_columns: { col: number; header: string; entity: string | null }[];
  check_results: { id: string; label: string; pass: boolean; details: string[] }[];
  mappings: { label: string; gl: string; via: string }[];
  diff: { added: unknown[]; removed: unknown[]; changed: unknown[] } | null;
  uploaded_at: string; uploaded_by_name: string | null;
}

export interface FlagRecord extends FlagRow { id: string; status: 'open' | 'explained' | 'resolved'; note: string | null; noted_at: string | null; noted_by_name: string | null; stale: boolean }
export interface ChecklistRecord { period: string; entity_code: string; gl_number: string; expected: number; months_posted: number; window_months: number; status: 'missing' | 'posted' | 'not_needed'; note: string | null; updated_at: string | null }

export interface FinData {
  entities: FinEntity[];
  accounts: FinAccount[];
  aliases: FinAlias[];
  periods: FinPeriod[];
  thresholds: Thresholds;
  lines: Line[];
  uploads: UploadRow[]; // every version, newest first
}

export async function loadReference(sb: Supabase) {
  const [entities, accounts, aliases, periods, settings] = await Promise.all([
    sb.from('fin_entities').select('*').order('sort_order'),
    sb.from('fin_accounts').select('gl_number, name, section, sort_order, active, created_period').order('sort_order'),
    sb.from('fin_account_aliases').select('alias_key, alias, gl_number').order('alias'),
    sb.from('fin_periods').select('period, status, closed_at, notes').order('period'),
    sb.from('fin_settings').select('key, value'),
  ]);
  const s = Object.fromEntries((must(settings) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entities: (must(entities) as any[]).map((e) => ({ ...e, prime_min: e.prime_min == null ? null : Number(e.prime_min), prime_max: e.prime_max == null ? null : Number(e.prime_max) })) as FinEntity[],
    accounts: must(accounts) as FinAccount[],
    aliases: must(aliases) as FinAlias[],
    periods: must(periods) as FinPeriod[],
    thresholds: { ...DEFAULT_THRESHOLDS, ...((s.thresholds as Partial<Thresholds>) ?? {}) } as Thresholds,
    reviewState: (s.review_state as { version?: string } | undefined) ?? null,
  };
}

/** Every stored line (paged past PostgREST's 1,000-row cap). */
export async function loadLines(sb: Supabase): Promise<Line[]> {
  const out: Line[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('fin_lines').select('period, entity_code, gl_number, amount').order('period').order('entity_code').order('gl_number').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.push({ period: r.period, entity: r.entity_code, gl: r.gl_number, cents: toCents(r.amount) });
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadUploads(sb: Supabase): Promise<UploadRow[]> {
  const { data, error } = await sb
    .from('fin_uploads')
    .select('id, period, version, status, source, file_path, file_name, sheet_name, detected_columns, check_results, mappings, diff, uploaded_at, by:profiles!fin_uploads_uploaded_by_fkey(full_name, email)')
    .order('period', { ascending: false })
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map(({ by, ...u }: any) => ({ ...u, uploaded_by_name: by ? by.full_name || by.email : null }));
}

export async function loadAll(sb: Supabase): Promise<FinData & { reviewState: { version?: string } | null }> {
  const [ref, lines, uploads] = await Promise.all([loadReference(sb), loadLines(sb), loadUploads(sb)]);
  return { ...ref, lines, uploads };
}

export async function loadFlags(sb: Supabase): Promise<FlagRecord[]> {
  const { data, error } = await sb
    .from('fin_flags')
    .select('id, period, entity_code, gl_number, type, rule_key, severity, message, impact, status, note, noted_at, stale, by:profiles!fin_flags_noted_by_fkey(full_name, email)')
    .order('period', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map(({ by, ...f }: any) => ({ ...f, impact: f.impact == null ? null : toCents(f.impact), noted_by_name: by ? by.full_name || by.email : null }));
}

export async function loadChecklist(sb: Supabase): Promise<ChecklistRecord[]> {
  const { data, error } = await sb.from('fin_checklist').select('*').order('entity_code').order('gl_number');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((c: any) => ({ ...c, expected: toCents(c.expected) }));
}

// ─── Recalculation (flags + close checklist) ─────────────────────────────────

/** Changes whenever anything the flags depend on changes (uploads, statuses, settings, locations, accounts). */
export function reviewVersion(d: FinData): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({
    u: d.uploads.filter((u) => u.status === 'current').map((u) => u.id).sort(),
    p: d.periods.map((p) => `${p.period}:${p.status}`),
    t: d.thresholds,
    e: d.entities.map((e) => [e.code, e.prime_cost_check, e.prime_min, e.prime_max, e.name]),
    a: d.accounts.map((a) => [a.gl_number, a.name, a.section, a.created_period]),
    v: 3, // bump when the rules change
  }));
  return h.digest('hex').slice(0, 24);
}

export async function recalcReview(sb: Supabase, d: FinData): Promise<{ flags: number; checklist: number }> {
  const current = d.uploads.filter((u) => u.status === 'current');
  const flags = computeFlags({
    lines: d.lines, accounts: d.accounts, entities: d.entities.filter((e) => e.active), thresholds: d.thresholds,
    periods: d.periods.map((p) => ({ period: p.period, status: p.status })),
    uploads: current.map((u) => ({ period: u.period, mappings: u.mappings ?? [] })),
  });
  const periods = d.periods.map((p) => p.period);
  const toDb = flags.map((f) => ({ ...f, impact: f.impact === null ? null : (f.impact / 100).toFixed(2) }));
  must(await sb.rpc('fin_save_flags', { p_periods: periods, p_flags: toDb }));

  // Close checklist for every open month
  const idx = indexLines(d.lines);
  const closed = d.periods.filter((p) => p.status === 'closed').map((p) => p.period);
  const { data: existingRows } = await sb.from('fin_checklist').select('period, entity_code, gl_number');
  let items = 0;
  for (const p of d.periods.filter((x) => x.status === 'open')) {
    const existing = new Set((existingRows ?? []).filter((r) => r.period === p.period).map((r) => `${r.entity_code}|${r.gl_number}`));
    const rows = computeChecklist(idx, p.period, closed, d.entities.filter((e) => e.active), d.thresholds, existing);
    must(await sb.rpc('fin_save_checklist', {
      p_period: p.period,
      p_items: rows.map((r) => ({ entity_code: r.entity_code, gl_number: r.gl_number, expected: (r.expected / 100).toFixed(2), months_posted: r.months_posted, window_months: r.window_months, posted: r.posted })),
    }));
    items += rows.length;
  }
  must(await sb.from('fin_settings').upsert({ key: 'review_state', value: { version: reviewVersion(d), at: new Date().toISOString(), flags: flags.length, checklist: items } }));
  return { flags: flags.length, checklist: items };
}

/** Recalculate if anything changed since the last run (called by the Accounting layout). */
export async function ensureReviewFresh(sb: Supabase, d: FinData & { reviewState: { version?: string } | null }) {
  if (d.reviewState?.version === reviewVersion(d)) return false;
  await recalcReview(sb, d);
  return true;
}

export async function audit(sb: Supabase, action: string, period: string | null, detail: Record<string, unknown>) {
  await sb.rpc('fin_log', { p_action: action, p_period: period, p_detail: detail });
}
