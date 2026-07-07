// Shared types, constants, and formatters for the restaurant sales dashboard.

export const GOLD = '#C5A572';

export const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21'] as const;
export type LocationName = (typeof LOCATIONS)[number];

// 'All' represents the All-Locations aggregate view.
export type LocationTab = LocationName | 'All';

// One row of daily_sales, denormalized with its location name attached.
// labor comes from daily_sales.labor_cost; foodCost from daily_costs (MarginEdge
// purchase-based proxy) joined on location+date (null when no invoice data).
export interface DailyRow {
  date: string;       // YYYY-MM-DD
  location: LocationName;
  fnb: number;        // fnb_revenue
  total: number;      // total_revenue (validated against Toast ground truth)
  guests: number;     // guest_count
  checks: number;     // check_count
  labor: number;      // labor_cost
  foodCost: number | null; // daily_costs.food_cost (purchase proxy), null if absent
}

// One month of invoice_summary for a location (MarginEdge invoice spend).
// food/bev split is an approximate vendor-name classification.
export interface InvoiceMonth {
  location: LocationName;
  month: string;      // YYYY-MM
  total: number;      // total_invoices
  food: number;       // food_invoices (approx)
  bev: number;        // bev_invoices (approx)
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Full-precision currency for KPI values, e.g. $1,001,008 */
export function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Abbreviated currency for axes/compact spots, e.g. $1.00M / $12.3k */
export function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

/** Avg-check style, always two decimals: $54.12 */
export function fmtCheck(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

// ─── Month helpers ────────────────────────────────────────────────────────────

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM' → 'Mon' */
export function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return MONTH_ABBR[m - 1] ?? ym;
}

/** 'YYYY-MM' → "Mon 'YY" (year-aware label for multi-year ranges) */
export function monthLabelYear(ym: string): string {
  const m = Number(ym.slice(5, 7));
  const yy = ym.slice(2, 4);
  return `${MONTH_ABBR[m - 1] ?? ''} '${yy}`;
}

/** 'YYYY-MM' → full "March 2026" */
export function monthLabelFull(ym: string): string {
  const y = ym.slice(0, 4);
  const m = Number(ym.slice(5, 7));
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${y}`;
}

/** Shift a 'YYYY-MM' by a signed number of months. */
export function shiftMonth(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Inclusive list of 'YYYY-MM' between from and to. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // guard against inverted ranges
  if (from > to) return [from];
  while (cur <= to) {
    out.push(cur);
    cur = shiftMonth(cur, 1);
    if (out.length > 240) break; // safety
  }
  return out;
}

/** The 'YYYY-MM' of a 'YYYY-MM-DD' date string. */
export function ymOf(date: string): string {
  return date.slice(0, 7);
}
