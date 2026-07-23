// Shared types, constants, and formatters for the restaurant sales dashboard.

export const GOLD = '#C5A572';

export const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21'] as const;
export type LocationName = (typeof LOCATIONS)[number];

// 'All' represents the All-Locations aggregate view.
export type LocationTab = LocationName | 'All';

// Stable per-location colors for stacked bars / multi-series legends.
export const LOCATION_COLORS: Record<LocationName, string> = {
  Grandview: '#C5A572',   // gold
  Gahanna: '#3b82f6',     // blue
  Westerville: '#10b981', // green
  'PO BOX 21': '#a855f7', // purple
};

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
// food/bev/unclassified split is an approximate vendor-name classification;
// every invoice lands in exactly one bucket so total = food + bev + unclassified.
export interface InvoiceMonth {
  location: LocationName;
  month: string;        // YYYY-MM
  total: number;        // total_invoices (= food + bev + unclassified)
  food: number;         // food_invoices (approx, vendor-name classified)
  bev: number;          // bev_invoices (approx, vendor-name classified)
  unclassified: number; // unclassified_invoices — vendor name didn't match either
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

// ─── Week helpers (ISO Monday-anchored, matching Postgres date_trunc('week')) ───

/** Monday (YYYY-MM-DD) of the ISO week containing `date`. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay();            // 0=Sun … 6=Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Shift a 'YYYY-MM-DD' by a signed number of days. */
export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' (week Monday) → short label like "Jul 14". */
export function weekLabel(mondayDate: string): string {
  const d = new Date(`${mondayDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Day-of-week index for a date (0=Sun…6=Sat), UTC-stable. */
export function dowOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// ─── Prime cost (invoice-based) ─────────────────────────────────────────────────

// One period (week or month) of invoice-based prime cost, from the
// weekly_prime_cost / monthly_prime_cost views. location === 'All' is the
// combined (location_id IS NULL) aggregate row.
export interface PrimeCostRow {
  periodStart: string;              // YYYY-MM-DD (week Monday, or month first day)
  location: LocationName | 'All';
  cogs: number;
  labor: number;
  revenue: number;
  primePct: number | null;          // (cogs + labor) / revenue * 100, null if no revenue
}

// One (week, location, item) popularity row from the weekly_item_popularity
// view — feeds the Fun Facts "Most Popular Item" metric.
export interface ItemWeekRow {
  weekStart: string;   // YYYY-MM-DD (Monday)
  location: LocationName;
  itemName: string;
  qty: number;
  revenue: number;
}

// Prime-cost benchmark + traffic-light thresholds (Part 1 spec).
export const PRIME_BENCHMARK = 62;  // benchmark line
export const PRIME_YELLOW_MAX = 68; // green < 62 ≤ yellow ≤ 68 < red

/** Traffic-light color for a prime-cost %: green <62, yellow 62–68, red >68. */
export function primeCostColor(pct: number | null): string {
  if (pct == null) return 'var(--muted-foreground, #71717a)';
  if (pct < PRIME_BENCHMARK) return '#10b981';   // green
  if (pct <= PRIME_YELLOW_MAX) return '#f59e0b'; // yellow
  return '#ef4444';                              // red
}
