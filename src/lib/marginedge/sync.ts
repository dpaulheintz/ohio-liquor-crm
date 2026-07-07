/**
 * MarginEdge → Supabase sync (hybrid cost model).
 *
 *  - daily_costs   : total daily invoice PURCHASES from the cheap /orders list
 *                    (proxy for COGS; includes OPEX — labeled as purchases).
 *  - invoice_summary: food vs beverage split, derived from per-invoice line-item
 *                    detail joined to a product→category→categoryType map.
 *                    Expensive (one /orders/{id} call per invoice) — run as a
 *                    one-time historical backfill + bounded nightly (current month).
 */

import { createAdminClient } from '@/lib/supabase/server';
import { getRestaurantUnits, getOrders, toArray } from './client';

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Approximate food vs beverage classification by vendor name. The /orders list
// carries vendorName + orderTotal, so this needs no per-invoice detail calls.
// (Line-item categoryId is null and the /products catalog is unpageable, so a
// precise split isn't derivable from this API — this keyword heuristic covers
// the major vendors and is labeled "approximate" in the UI.)
const BEV_VENDOR_RE = /\b(wine|spirit|liquor|beer|brew|distribut|beverage|vintner|cellar|heidelberg|cavalier|vintage|winery|superior beverage)\b/i;
const FOOD_VENDOR_RE = /\b(food|produce|meat|seafood|fish|bakery|bread|dairy|farm|provision|sysco|gordon|hillcrest|us foods|restaurant depot|grocery|butcher|poultry|coffee)\b/i;

export function classifyVendor(vendorName: string): 'FOOD' | 'BEV' | 'UNCLASSIFIED' {
  if (BEV_VENDOR_RE.test(vendorName)) return 'BEV';
  if (FOOD_VENDOR_RE.test(vendorName)) return 'FOOD';
  return 'UNCLASSIFIED';
}

interface MappedLocation { id: string; name: string; marginedge_id: string }

async function mappedLocations(locationName?: string): Promise<MappedLocation[]> {
  const supabase = createAdminClient();
  let q = supabase.from('locations').select('id, name, marginedge_id').not('marginedge_id', 'is', null);
  if (locationName) q = q.eq('name', locationName);
  const { data } = await q;
  return (data ?? []).map((l) => ({ id: String(l.id), name: String(l.name), marginedge_id: String(l.marginedge_id) }));
}

// ─── Step: map restaurantUnits → locations.marginedge_id ────────────────────────
export async function mapLocations() {
  const supabase = createAdminClient();
  const { data: locations } = await supabase.from('locations').select('id, name');
  const units = toArray(await getRestaurantUnits(), 'restaurants') as Array<Record<string, unknown>>;

  const unitId = (u: Record<string, unknown>) => String(u.id ?? u.restaurantUnitId ?? '');
  const unitName = (u: Record<string, unknown>) => String(u.name ?? u.unitName ?? '');

  const mapped: Array<{ location: string; marginedge_id: string; unitName: string }> = [];
  const unmatched: string[] = [];

  for (const loc of locations ?? []) {
    const locNorm = normalizeName(String(loc.name));
    const match = units.find((u) => {
      const un = normalizeName(unitName(u));
      return un.length > 0 && (un.includes(locNorm) || locNorm.includes(un));
    });
    const meId = match ? unitId(match) : '';
    if (match && meId) {
      await supabase.from('locations').update({ marginedge_id: meId }).eq('id', loc.id);
      mapped.push({ location: String(loc.name), marginedge_id: meId, unitName: unitName(match) });
    } else {
      unmatched.push(String(loc.name));
    }
  }
  return { mapped, unmatched, availableUnits: units.map((u) => ({ id: unitId(u), name: unitName(u) })) };
}

// ─── Step: daily_costs from /orders list (cheap) ────────────────────────────────
export async function syncCosts(startDate: string, endDate: string, locationName?: string) {
  const supabase = createAdminClient();
  const locations = await mappedLocations(locationName);
  if (locations.length === 0) return { error: 'No mapped locations. Run step=locations first.' };

  const results: Array<Record<string, unknown>> = [];
  for (const loc of locations) {
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: loc.marginedge_id,
    })) as Array<Record<string, unknown>>;

    const byDay: Record<string, number> = {};
    for (const o of orders) {
      const d = String(o.invoiceDate ?? '').slice(0, 10);
      if (!d) continue;
      byDay[d] = (byDay[d] ?? 0) + Number(o.orderTotal ?? 0);
    }

    // Revenue per day (for food_cost_pct) from daily_sales — computed in JS
    // because exec_sql wraps queries in SELECT and can't run an UPDATE.
    const { data: sales } = await supabase
      .from('daily_sales')
      .select('business_date, total_revenue')
      .eq('location_id', loc.id)
      .gte('business_date', startDate)
      .lte('business_date', endDate);
    const revByDay = new Map<string, number>();
    for (const s of sales ?? []) revByDay.set(String(s.business_date), Number(s.total_revenue ?? 0));

    const rows = Object.entries(byDay).map(([date, total]) => {
      const rev = revByDay.get(date) ?? 0;
      return {
        location_id: loc.id, date, food_cost: total, cogs_total: total,
        food_cost_pct: rev > 0 ? Math.round((total / rev) * 10000) / 100 : null,
      };
    });
    if (rows.length > 0) {
      await supabase.from('daily_costs').upsert(rows, { onConflict: 'location_id,date' });
    }
    results.push({ location: loc.name, orders: orders.length, days: rows.length });
  }

  return { range: { startDate, endDate }, results };
}

// ─── Step: invoice_summary from /orders list (fast; vendor-based food/bev) ───────
export async function syncInvoices(startDate: string, endDate: string, locationName?: string) {
  const supabase = createAdminClient();
  const locations = await mappedLocations(locationName);
  if (locations.length === 0) return { error: 'No mapped locations. Run step=locations first.' };

  const results: Array<Record<string, unknown>> = [];
  for (const loc of locations) {
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: loc.marginedge_id,
    })) as Array<Record<string, unknown>>;

    // month → { total, food, bev } — food/bev split approximated by vendor name
    const byMonth: Record<string, { total: number; food: number; bev: number }> = {};
    for (const o of orders) {
      const invDate = String(o.invoiceDate ?? '').slice(0, 10);
      if (!invDate) continue;
      const ym = invDate.slice(0, 7);
      const amt = Number(o.orderTotal ?? 0);
      const m = (byMonth[ym] ??= { total: 0, food: 0, bev: 0 });
      m.total += amt;
      const type = classifyVendor(String(o.vendorName ?? ''));
      if (type === 'FOOD') m.food += amt;
      else if (type === 'BEV') m.bev += amt;
    }

    const rows = Object.entries(byMonth).map(([month, v]) => ({
      location_id: loc.id, month,
      total_invoices: Math.round(v.total * 100) / 100,
      food_invoices: Math.round(v.food * 100) / 100,
      bev_invoices: Math.round(v.bev * 100) / 100,
    }));
    if (rows.length > 0) {
      await supabase.from('invoice_summary').upsert(rows, { onConflict: 'location_id,month' });
    }
    results.push({ location: loc.name, orders: orders.length, months: rows.length });
  }
  return { range: { startDate, endDate }, results };
}
