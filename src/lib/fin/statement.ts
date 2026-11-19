// Accounting: the P&L statement layout used by the side-by-side screen, the location view and the
// month-end package — sections, account lines, then subtotals exactly like accounting's sheet.
import { TOTAL, accountsUsed, scopeMonths, scopedValue, totals, type LineIndex, type Scope } from './compute';
import { SECTION_LABEL, addMonths, type FinAccount, type Section } from './shared';

export interface StatementRow {
  kind: 'section' | 'account' | 'subtotal' | 'profit';
  key: string;
  label: string;
  gl?: string;
  values: Record<string, number | null>; // column key → cents
}

const SUBTOTAL_AFTER: Record<Section, { key: string; label: string; pick: (t: NonNullable<ReturnType<typeof totals>>) => number }[]> = {
  sales: [{ key: 'gross', label: 'Gross Sales', pick: (t) => t.gross }],
  discounts: [{ key: 'disc', label: 'Total Discounts', pick: (t) => t.discounts }, { key: 'net', label: 'Net Sales', pick: (t) => t.net }],
  prime: [{ key: 'prime', label: 'Total Prime Cost', pick: (t) => t.prime }],
  opex: [{ key: 'opex', label: 'Total Operating Expense', pick: (t) => t.opex }],
  noncontrollable: [{ key: 'nonc', label: 'Total Non Controllable Expense', pick: (t) => t.noncontrollable }],
};

/**
 * Columns are either entities for one set of months (side by side), or months for one entity (location view).
 * Each column: { key, entity, months }.
 */
export function buildStatement(idx: LineIndex, accounts: FinAccount[], columns: { key: string; entity: string; months: string[] }[]): StatementRow[] {
  const byGl = new Map(accounts.map((a) => [a.gl_number, a]));
  const allMonths = [...new Set(columns.flatMap((c) => c.months))];
  const entities = [...new Set(columns.map((c) => c.entity))];
  const used = accountsUsed(idx, accounts, allMonths, entities.length === 1 ? entities[0] : undefined);
  const tot = Object.fromEntries(columns.map((c) => [c.key, totals(idx, byGl, c.months, c.entity)]));
  const rows: StatementRow[] = [];
  const sumOf = (c: { entity: string; months: string[] }, gl: string) => {
    let s = 0, any = false;
    for (const m of c.months) { const p = idx.get(m); if (!p) continue; any = true; s += c.entity === TOTAL ? [...p.values()].reduce((x, e) => x + (e.get(gl) ?? 0), 0) : p.get(c.entity)?.get(gl) ?? 0; }
    return any ? s : null;
  };
  for (const section of Object.keys(SECTION_LABEL) as Section[]) {
    const accs = used.filter((a) => a.section === section);
    rows.push({ kind: 'section', key: `sec-${section}`, label: SECTION_LABEL[section], values: {} });
    for (const a of accs) rows.push({ kind: 'account', key: a.gl_number, gl: a.gl_number, label: `${a.gl_number} - ${a.name}`, values: Object.fromEntries(columns.map((c) => [c.key, sumOf(c, a.gl_number)])) });
    for (const s of SUBTOTAL_AFTER[section]) rows.push({ kind: 'subtotal', key: s.key, label: s.label, values: Object.fromEntries(columns.map((c) => [c.key, tot[c.key] ? s.pick(tot[c.key]!) : null])) });
  }
  rows.push({ kind: 'profit', key: 'profit', label: 'Net Profit', values: Object.fromEntries(columns.map((c) => [c.key, tot[c.key]?.profit ?? null])) });
  return rows;
}

export const netSalesOf = (rows: StatementRow[], col: string) => rows.find((r) => r.key === 'net')?.values[col] ?? null;

export type Compare = 'none' | 'pm' | 'ly';
export const COMPARE_LABEL: Record<Compare, string> = { none: '% of net sales', pm: 'vs prior month', ly: 'vs same month last year' };

/** The comparison period for a scope: the same scope shifted back 1 month (prior month) or 12 (last year). */
export function compareMonths(period: string, scope: Scope, compare: Compare): string[] | null {
  if (compare === 'none') return null;
  return scopeMonths(addMonths(period, compare === 'pm' ? -1 : -12), scope);
}

export { scopedValue };
