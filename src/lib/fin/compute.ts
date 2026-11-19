// Accounting: P&L arithmetic on stored account lines (cents). Subtotals are always recalculated here,
// never read from the export, so every screen agrees with the checks that ran on import.
import { SECTIONS, addMonths, type FinAccount, type Line, type Section } from './shared';

export type Scope = 'month' | 'ytd' | 't3m';
export const TOTAL = 'TOTAL';

/** period → entity → gl → cents. A period present here has an upload. */
export type LineIndex = Map<string, Map<string, Map<string, number>>>;

export function indexLines(lines: Line[]): LineIndex {
  const idx: LineIndex = new Map();
  for (const l of lines) {
    let p = idx.get(l.period);
    if (!p) idx.set(l.period, (p = new Map()));
    let e = p.get(l.entity);
    if (!e) p.set(l.entity, (e = new Map()));
    e.set(l.gl, (e.get(l.gl) ?? 0) + l.cents);
  }
  return idx;
}

export const hasPeriod = (idx: LineIndex, period: string) => idx.has(period);

/** One account's amount; entity TOTAL sums every location. null when the month has no upload. */
export function value(idx: LineIndex, period: string, entity: string, gl: string): number | null {
  const p = idx.get(period);
  if (!p) return null;
  if (entity === TOTAL) { let s = 0; for (const e of p.values()) s += e.get(gl) ?? 0; return s; }
  return p.get(entity)?.get(gl) ?? 0;
}

/** Months covered by a scope ending at `period`: the month, Jan..month (YTD), or the last 3 months. */
export function scopeMonths(period: string, scope: Scope): string[] {
  if (scope === 'month') return [period];
  if (scope === 't3m') return [addMonths(period, -2), addMonths(period, -1), period];
  const m = Number(period.slice(5, 7));
  return Array.from({ length: m }, (_, i) => addMonths(period, i - (m - 1)));
}

export function scopedValue(idx: LineIndex, period: string, scope: Scope, entity: string, gl: string): number | null {
  let s = 0, any = false;
  for (const p of scopeMonths(period, scope)) { const v = value(idx, p, entity, gl); if (v !== null) { s += v; any = true; } }
  return any ? s : null;
}

export interface Totals {
  sales: number; discounts: number; gross: number; net: number;
  prime: number; opex: number; noncontrollable: number; profit: number;
  bySection: Record<Section, number>;
}

export function totals(idx: LineIndex, accounts: Map<string, FinAccount>, periods: string[], entity: string): Totals | null {
  const bySection: Record<Section, number> = { sales: 0, discounts: 0, prime: 0, opex: 0, noncontrollable: 0 };
  let any = false;
  for (const period of periods) {
    const p = idx.get(period);
    if (!p) continue;
    any = true;
    const ents = entity === TOTAL ? [...p.values()] : [p.get(entity) ?? new Map<string, number>()];
    for (const e of ents) for (const [gl, c] of e) { const s = accounts.get(gl)?.section; if (s) bySection[s] += c; }
  }
  if (!any) return null;
  const net = bySection.sales + bySection.discounts;
  return {
    sales: bySection.sales, discounts: bySection.discounts, gross: bySection.sales, net,
    prime: bySection.prime, opex: bySection.opex, noncontrollable: bySection.noncontrollable,
    profit: net - bySection.prime - bySection.opex - bySection.noncontrollable,
    bySection,
  };
}

export const pctOf = (cents: number, net: number) => (net ? cents / net : null);
export const primePct = (t: Totals | null) => (t && t.net ? t.prime / t.net : null);

/** % change, signed against the base's magnitude (so a cost going 100 → 150 is +50%). */
export const change = (cur: number | null, base: number | null) =>
  cur === null || base === null || base === 0 ? null : (cur - base) / Math.abs(base);

/** Accounts that appear in any of these months (for the given entity, or any entity), in P&L order. */
export function accountsUsed(idx: LineIndex, accounts: FinAccount[], periods: string[], entity?: string): FinAccount[] {
  const used = new Set<string>();
  for (const period of periods) {
    const p = idx.get(period);
    if (!p) continue;
    for (const [e, m] of p) if (!entity || entity === TOTAL || e === entity) for (const [gl, c] of m) if (c !== 0) used.add(gl);
  }
  return accounts
    .filter((a) => used.has(a.gl_number))
    .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || a.sort_order - b.sort_order);
}

/** Periods with an upload, oldest first. */
export const loadedPeriods = (idx: LineIndex) => [...idx.keys()].sort();

/** The 12 months ending at `period`. */
export const twelveMonths = (period: string) => Array.from({ length: 12 }, (_, i) => addMonths(period, i - 11));
