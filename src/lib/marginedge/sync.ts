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
import {
  getRestaurantUnits, getCategories, getOrders, getOrderDetail, getProducts, toArray,
} from './client';

type CategoryType = 'FOOD' | 'LIQUOR' | 'BEER' | 'NA_BEVERAGES' | 'LABOR' | 'OTHER' | 'UNKNOWN';

const BEV_TYPES = new Set<CategoryType>(['LIQUOR', 'BEER', 'NA_BEVERAGES']);

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
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

// Build companyConceptProductId → CategoryType for one unit.
async function buildProductTypeMap(unitId: string): Promise<Map<string, CategoryType>> {
  // categoryId → categoryType
  const cats = toArray(await getCategories(unitId), 'categories') as Array<Record<string, unknown>>;
  const catType = new Map<string, CategoryType>();
  for (const c of cats) catType.set(String(c.categoryId), String(c.categoryType ?? 'UNKNOWN') as CategoryType);

  // product → dominant categoryId → type. The /products endpoint ignores offset
  // (same as /orders), so a single fetch is all we can get; products not in the
  // map fall back to UNKNOWN and are simply excluded from the food/bev split.
  const productType = new Map<string, CategoryType>();
  const batch = toArray(await getProducts(unitId, 500), 'products') as Array<Record<string, unknown>>;
  for (const p of batch) {
    const pid = String(p.companyConceptProductId ?? '');
    const cats2 = toArray(p.categories) as Array<Record<string, unknown>>;
    if (!pid || cats2.length === 0) continue;
    const dominant = cats2.reduce((a, b) => (Number(b.percentAllocation ?? 0) > Number(a.percentAllocation ?? 0) ? b : a));
    productType.set(pid, catType.get(String(dominant.categoryId)) ?? 'UNKNOWN');
  }
  return productType;
}

// ─── Step: invoice_summary via line-item detail (expensive) ─────────────────────
export async function syncInvoices(startDate: string, endDate: string, locationName?: string) {
  const supabase = createAdminClient();
  const locations = await mappedLocations(locationName);
  if (locations.length === 0) return { error: 'No mapped locations. Run step=locations first.' };

  const results: Array<Record<string, unknown>> = [];
  for (const loc of locations) {
    const productType = await buildProductTypeMap(loc.marginedge_id);
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: loc.marginedge_id,
    })) as Array<Record<string, unknown>>;

    // month → { total, food, bev }
    const byMonth: Record<string, { total: number; food: number; bev: number }> = {};

    for (const o of orders) {
      const invDate = String(o.invoiceDate ?? '').slice(0, 10);
      if (!invDate) continue;
      const ym = invDate.slice(0, 7);
      const m = (byMonth[ym] ??= { total: 0, food: 0, bev: 0 });
      m.total += Number(o.orderTotal ?? 0);

      const detail = await getOrderDetail(String(o.orderId), loc.marginedge_id) as Record<string, unknown>;
      const items = toArray(detail.lineItems) as Array<Record<string, unknown>>;
      for (const li of items) {
        const type = productType.get(String(li.companyConceptProductId ?? '')) ?? 'UNKNOWN';
        const amt = Number(li.linePrice ?? 0);
        if (type === 'FOOD') m.food += amt;
        else if (BEV_TYPES.has(type)) m.bev += amt;
      }
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
