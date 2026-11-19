// Accounting (P&L hub): shared types, sections and exact money helpers (client + server).
// Money is integer cents everywhere in the app; the database stores numeric(14,2).

export const ACCOUNTING_PATH = '/accounting';
export const FIN_BUCKET = 'fin-uploads';

export const SECTIONS = ['sales', 'discounts', 'prime', 'opex', 'noncontrollable'] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  sales: 'Sales',
  discounts: 'Discounts',
  prime: 'Prime Cost',
  opex: 'Operating Expenses',
  noncontrollable: 'Non Controllable',
};

export const SUBTOTALS = ['gross_sales', 'total_discounts', 'net_sales', 'total_prime', 'total_opex', 'total_noncontrollable', 'net_profit'] as const;
export type SubtotalName = (typeof SUBTOTALS)[number];
export const SUBTOTAL_LABEL: Record<SubtotalName, string> = {
  gross_sales: 'Gross Sales',
  total_discounts: 'Total Discounts',
  net_sales: 'Net Sales',
  total_prime: 'Total Prime Cost',
  total_opex: 'Total Operating Expense',
  total_noncontrollable: 'Total Non Controllable Expense',
  net_profit: 'Net Profit',
};

export interface FinEntity {
  code: string;
  name: string;
  aliases: string[];
  sort_order: number;
  prime_cost_check: boolean;
  toast_location_id: string | null;
  active: boolean;
  /** null = use the global range in Thresholds */
  prime_min: number | null;
  prime_max: number | null;
}

export interface FinAccount {
  gl_number: string;
  name: string;
  section: Section;
  sort_order: number;
  active: boolean;
  created_period: string | null;
}

export interface FinAlias { alias_key: string; alias: string; gl_number: string }

export interface FinPeriod { period: string; status: 'open' | 'closed'; closed_at: string | null; notes: string | null }

export interface Thresholds {
  mom_pct: number;
  materiality: number;
  yoy_pct: number;
  large_multiple: number;
  high_priority: number;
  prime_min: number;
  prime_max: number;
  reclass_min: number;
  reclass_tolerance: number;
  checklist_window: number;
  checklist_min_months: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  mom_pct: 0.2, materiality: 1000, yoy_pct: 0.5, large_multiple: 2, high_priority: 10000,
  prime_min: 0.55, prime_max: 0.68, reclass_min: 5000, reclass_tolerance: 0.15, checklist_window: 9, checklist_min_months: 7,
};

/** Settings › cross-checks: which GLs compare with Toast F&B revenue and with Bottle Sales. */
export interface CrossCheckSettings { sales_gls: string[]; dsp_entity: string; dsp_gl: string; tolerance?: number }
export const DEFAULT_CROSS_CHECKS: CrossCheckSettings = { sales_gls: ['4100', '4105'], dsp_entity: 'DSP', dsp_gl: '4301', tolerance: 0.02 };

/** One stored account line, money in cents. Period is the first of the month ("2026-10-01"). */
export interface Line { period: string; entity: string; gl: string; cents: number }

// ─── Money ────────────────────────────────────────────────────────────────────

/** Number from Excel/JSON → integer cents, immune to float noise (0.285 → 29¢ not 28¢). */
export function toCents(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${v}`);
  return Math.round(Number((n * 100).toPrecision(15)));
}

/** Cents → "1234.56" for the database (numeric) and exports. */
export const centsToDecimal = (c: number) => {
  const neg = c < 0, a = Math.abs(c);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

export function fmtUsd(cents: number, opts: { whole?: boolean; sign?: boolean } = {}): string {
  const neg = cents < 0, a = Math.abs(cents);
  const dollars = Math.floor(a / 100).toLocaleString('en-US');
  const body = opts.whole ? `$${Math.round(a / 100).toLocaleString('en-US')}` : `$${dollars}.${String(a % 100).padStart(2, '0')}`;
  return `${neg ? '−' : opts.sign && cents > 0 ? '+' : ''}${body}`;
}

/** Accounting style: negatives in parentheses, whole dollars. */
export function fmtAcct(cents: number | null | undefined): string {
  if (cents == null) return '';
  if (cents === 0) return '–';
  const s = `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
  return cents < 0 ? `(${s})` : s;
}

/** Spreadsheet style with cents: 1,234.56 · (1,234.56) · – for zero · blank for no data. */
export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '';
  if (cents === 0) return '–';
  const a = Math.abs(cents);
  const s = `${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
  return cents < 0 ? `(${s})` : s;
}

export function fmtPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '';
  return `${(ratio * 100).toFixed(digits)}%`;
}

// ─── Text keys ────────────────────────────────────────────────────────────────

/** "Misc. Payroll" and "Misc Payroll" → "miscpayroll". Used for account aliases. */
export const aliasKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "8 - Distilled Spirits Plant" → "distilledspiritsplant". Used for entity column headers. */
export const entityKey = (s: string) => aliasKey(s.replace(/^\s*\d+\s*-\s*/, ''));

// ─── Periods ──────────────────────────────────────────────────────────────────

export const periodOf = (ym: string) => `${ym.slice(0, 7)}-01`;
export function addMonths(period: string, n: number): string {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}
export function periodLabel(period: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1));
  return d.toLocaleDateString('en-US', { month: style === 'long' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });
}
export const monthShort = (period: string) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
