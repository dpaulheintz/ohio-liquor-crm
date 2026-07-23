import { createAdminClient } from '@/lib/supabase/server';
import { RestaurantDashboardClient } from './dashboard-client';
import {
  LOCATIONS, type DailyRow, type InvoiceMonth, type LocationName,
  type PrimeCostRow, type ItemWeekRow,
} from './lib';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Restaurant Analytics | High Bank CRM' };

const PAGE_SIZE = 1000;

export default async function RestaurantAnalyticsPage() {
  const supabase = createAdminClient();

  // Map location_id → name (only the four restaurant locations we chart).
  const { data: locs } = await supabase.from('locations').select('id, name');
  const idToName = new Map<string, LocationName>();
  for (const l of locs ?? []) {
    if ((LOCATIONS as readonly string[]).includes(l.name)) {
      idToName.set(l.id as string, l.name as LocationName);
    }
  }

  // ── daily_sales (revenue, guests, labor) ──
  const salesRaw: Array<{
    business_date: string; location_id: string;
    fnb_revenue: number | null; total_revenue: number | null;
    guest_count: number | null; check_count: number | null; labor_cost: number | null;
  }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_sales')
      .select('business_date, location_id, fnb_revenue, total_revenue, guest_count, check_count, labor_cost')
      .order('business_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    salesRaw.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // ── daily_costs (MarginEdge purchase proxy, unfiltered daily total) →
  // map by location|date. Kept for potential daily-granularity use; Prime Cost
  // itself is now driven by invoice_summary (monthly, food/bev/unclassified split).
  const foodCostByKey = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_costs')
      .select('location_id, date, food_cost')
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    for (const c of data) foodCostByKey.set(`${c.location_id}|${c.date}`, Number(c.food_cost ?? 0));
    if (data.length < PAGE_SIZE) break;
  }

  // ── invoice_summary (monthly spend, food/bev/unclassified) — drives Prime Cost ──
  const invoiceMonths: InvoiceMonth[] = [];
  {
    const { data } = await supabase
      .from('invoice_summary')
      .select('location_id, month, total_invoices, food_invoices, bev_invoices, unclassified_invoices');
    for (const r of data ?? []) {
      const location = idToName.get(r.location_id as string);
      if (!location) continue;
      invoiceMonths.push({
        location, month: String(r.month),
        total: Number(r.total_invoices ?? 0),
        food: Number(r.food_invoices ?? 0),
        bev: Number(r.bev_invoices ?? 0),
        unclassified: Number(r.unclassified_invoices ?? 0),
      });
    }
  }

  // ── weekly_prime_cost + monthly_prime_cost views (invoice-based prime cost) ──
  // location_id NULL = combined ('All'). Rows for non-restaurant / unmapped
  // locations are skipped; the combined row is always kept.
  const toPrimeRow = (
    r: { location_id: string | null; cogs: unknown; labor: unknown; revenue: unknown; pct: unknown },
    periodStart: string,
  ): PrimeCostRow | null => {
    let location: LocationName | 'All';
    if (r.location_id == null) {
      location = 'All';
    } else {
      const name = idToName.get(r.location_id);
      if (!name) return null;
      location = name;
    }
    return {
      periodStart,
      location,
      cogs: Number(r.cogs ?? 0),
      labor: Number(r.labor ?? 0),
      revenue: Number(r.revenue ?? 0),
      primePct: r.pct == null ? null : Number(r.pct),
    };
  };

  const weeklyPrimeCost: PrimeCostRow[] = [];
  {
    const { data } = await supabase
      .from('weekly_prime_cost')
      .select('week_start, location_id, weekly_cogs, weekly_labor, weekly_revenue, prime_cost_pct')
      .order('week_start', { ascending: true });
    for (const r of data ?? []) {
      const row = toPrimeRow(
        { location_id: r.location_id, cogs: r.weekly_cogs, labor: r.weekly_labor, revenue: r.weekly_revenue, pct: r.prime_cost_pct },
        String(r.week_start),
      );
      if (row) weeklyPrimeCost.push(row);
    }
  }

  const monthlyPrimeCost: PrimeCostRow[] = [];
  {
    const { data } = await supabase
      .from('monthly_prime_cost')
      .select('month_start, location_id, monthly_cogs, monthly_labor, monthly_revenue, prime_cost_pct')
      .order('month_start', { ascending: true });
    for (const r of data ?? []) {
      const row = toPrimeRow(
        { location_id: r.location_id, cogs: r.monthly_cogs, labor: r.monthly_labor, revenue: r.monthly_revenue, pct: r.prime_cost_pct },
        String(r.month_start),
      );
      if (row) monthlyPrimeCost.push(row);
    }
  }

  // ── weekly_item_popularity (recent weeks only) — Fun Facts "Most Popular Item" ──
  const itemWeeks: ItemWeekRow[] = [];
  {
    // 28-day floor covers the last few complete weeks; the client picks the
    // target week. Keeps the payload to a few hundred rows.
    const floor = new Date();
    floor.setDate(floor.getDate() - 28);
    const { data } = await supabase
      .from('weekly_item_popularity')
      .select('week_start, location_id, item_name, qty, revenue')
      .gte('week_start', floor.toISOString().slice(0, 10));
    for (const r of data ?? []) {
      const location = idToName.get(r.location_id as string);
      if (!location) continue;
      itemWeeks.push({
        weekStart: String(r.week_start),
        location,
        itemName: String(r.item_name),
        qty: Number(r.qty ?? 0),
        revenue: Number(r.revenue ?? 0),
      });
    }
  }

  // Denormalize daily_sales, attaching labor + foodCost.
  const rows: DailyRow[] = [];
  for (const r of salesRaw) {
    const location = idToName.get(r.location_id);
    if (!location) continue;
    rows.push({
      date: r.business_date,
      location,
      fnb: r.fnb_revenue ?? 0,
      total: r.total_revenue ?? 0,
      guests: r.guest_count ?? 0,
      checks: r.check_count ?? 0,
      labor: r.labor_cost ?? 0,
      foodCost: foodCostByKey.get(`${r.location_id}|${r.business_date}`) ?? null,
    });
  }

  const dataThrough = rows.length > 0
    ? rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date)
    : null;

  return (
    <RestaurantDashboardClient
      rows={rows}
      invoiceMonths={invoiceMonths}
      weeklyPrimeCost={weeklyPrimeCost}
      monthlyPrimeCost={monthlyPrimeCost}
      itemWeeks={itemWeeks}
      dataThrough={dataThrough}
    />
  );
}
