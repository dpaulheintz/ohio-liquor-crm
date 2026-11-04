// Sold/Unsold default for Menu and Feature KPIs (from public.kpi_sold_default). Shared by the
// visit form (hint text) and the server action that fetches it.

export interface KpiSoldDefault {
  sold: boolean;
  /** "YYYY-MM" of the most recent High Bank purchase before the visit, any age. */
  lastPurchaseMonth: string | null;
  accountStatus: string | null;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Months from a "YYYY-MM" to the visit's "YYYY-MM-DD". */
function monthsBefore(ym: string, visitDate: string): number {
  const [y, m] = ym.split('-').map(Number);
  const [vy, vm] = visitDate.split('-').map(Number);
  return (vy - y) * 12 + (vm - m);
}

/** "Sold – last purchase Sep 2026" / "Unsold – no High Bank purchases found" */
export function soldDefaultHint(d: KpiSoldDefault, visitDate: string): string {
  const last = d.lastPurchaseMonth;
  const recent = last !== null && monthsBefore(last, visitDate) <= 12;
  if (d.sold) {
    if (recent) return `Sold – last purchase ${monthLabel(last)}`;
    return `Sold – account is a customer${last ? ` (last purchase ${monthLabel(last)})` : ''}`;
  }
  if (last) return `Unsold – no High Bank purchases in the 12 months before this visit (last ${monthLabel(last)})`;
  return 'Unsold – no High Bank purchases found';
}
