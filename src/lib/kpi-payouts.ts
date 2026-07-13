/**
 * KPI payout calculation — shared by the visit-log table, the QTD payout
 * tracker, and the CSV export so all three always agree on the same numbers.
 */

import type { KpiEventRow } from '@/app/actions/kpi';

// ─── Rates ────────────────────────────────────────────────────────────────────

export const PAYOUT_RATES = {
  Menu:    { unsold: 100, sold: 25 },
  Feature: { unsold: 40,  sold: 10 },
  Event:   { flat: 40 },
  Display: { perMonth: 50 },
} as const;

// ─── Per-event payout ─────────────────────────────────────────────────────────

/**
 * Payout for one KPI event, in isolation — rate × quantity by type +
 * sold/unsold status. Does NOT apply the Display monthly dedup (that requires
 * the full event set); use `computePayouts` for a real payout figure on
 * Display rows, which always pay a flat $50/month regardless of quantity.
 */
function baseEventPayout(e: Pick<KpiEventRow, 'kpi' | 'sold_status' | 'kpi_quantity'>): number {
  const qty = e.kpi_quantity > 0 ? e.kpi_quantity : 1;
  switch (e.kpi) {
    case 'Menu':
      return (e.sold_status === 'sold' ? PAYOUT_RATES.Menu.sold : PAYOUT_RATES.Menu.unsold) * qty;
    case 'Feature':
      return (e.sold_status === 'sold' ? PAYOUT_RATES.Feature.sold : PAYOUT_RATES.Feature.unsold) * qty;
    case 'Event':
      return PAYOUT_RATES.Event.flat * qty;
    case 'Display':
      return PAYOUT_RATES.Display.perMonth; // flat — quantity never applies
    default:
      return 0;
  }
}

/**
 * Computes the real payout for every event in the set, keyed by event id.
 *
 * Display KPIs pay $50/account/month regardless of how many times logged or
 * their quantity — only the earliest-visited Display event for a given
 * (account, month) pair earns the $50; every later log of the same display
 * that month pays $0. Menu/Feature/Event pay rate × kpi_quantity (sold/unsold
 * status sets the rate for Menu/Feature; Event is always the flat rate).
 */
export function computePayouts(events: readonly KpiEventRow[]): Map<string, number> {
  // Earliest Display event per (account_id, month) wins the month's $50.
  const displayGroups = new Map<string, KpiEventRow>(); // "accountId|month" -> earliest event so far
  for (const e of events) {
    if (e.kpi !== 'Display') continue;
    const month = e.visited_at.slice(0, 7); // YYYY-MM
    const key = `${e.account_id}|${month}`;
    const current = displayGroups.get(key);
    if (!current || e.visited_at < current.visited_at) {
      displayGroups.set(key, e);
    }
  }
  const payingDisplayIds = new Set([...displayGroups.values()].map(e => e.id));

  const payouts = new Map<string, number>();
  for (const e of events) {
    if (e.kpi === 'Display') {
      payouts.set(e.id, payingDisplayIds.has(e.id) ? PAYOUT_RATES.Display.perMonth : 0);
    } else {
      payouts.set(e.id, baseEventPayout(e));
    }
  }
  return payouts;
}

// ─── Quarter helpers ──────────────────────────────────────────────────────────

export interface QuarterOption {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;   // "Q3 2026"
  from: string;    // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function quarterOf(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(year, startMonth, 1);
  const to = new Date(year, startMonth + 3, 0); // last day of the quarter's 3rd month
  return { from: fmtDate(from), to: fmtDate(to) };
}

export function currentQuarterOption(): QuarterOption {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = quarterOf(now);
  const { from, to } = quarterRange(year, quarter);
  return { year, quarter, label: `Q${quarter} ${year}`, from, to };
}

/** Every quarter from the earliest event through the current quarter, newest first. */
export function listQuarterOptions(events: readonly KpiEventRow[]): QuarterOption[] {
  const now = new Date();
  const curYear = now.getFullYear();
  const curQuarter = quarterOf(now);

  let minYear = curYear;
  for (const e of events) {
    const d = e.visited_at.slice(0, 10);
    if (!d) continue;
    const y = Number(d.slice(0, 4));
    if (y < minYear) minYear = y;
  }

  const options: QuarterOption[] = [];
  for (let year = curYear; year >= minYear; year--) {
    const maxQ = year === curYear ? curQuarter : 4;
    for (let q = maxQ; q >= 1; q--) {
      const quarter = q as 1 | 2 | 3 | 4;
      const { from, to } = quarterRange(year, quarter);
      options.push({ year, quarter, label: `Q${quarter} ${year}`, from, to });
    }
  }
  return options;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function fmtPayout(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
