/**
 * MarginEdge → Supabase sync (hybrid cost model).
 *
 *  - daily_costs    : total daily invoice PURCHASES from the /orders list
 *                     (proxy for COGS; includes everything — labeled as purchases).
 *  - invoice_summary: food / beverage / unclassified split, derived from the
 *                     /orders list's vendorName (no category field exists on
 *                     that endpoint — confirmed via ?step=field-diag). Every
 *                     order lands in exactly one bucket so
 *                     total = food + bev + unclassified always reconciles.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { getRestaurantUnits, getOrders, toArray } from './client';

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Approximate food vs beverage classification by vendor name. The /orders list
// carries vendorName + orderTotal, so this needs no per-invoice detail calls.
// (Line-item categoryId is null, the /products catalog is unpageable, and the
// /orders list has NO category field at all — confirmed via ?step=field-diag,
// only vendorName/paymentAccount/status exist — so a precise API-driven split
// isn't possible. This keyword heuristic covers the major vendors.)
//
// Stems use \w* (not a trailing \b) so inflected/compound vendor names still
// match — e.g. "brew" must also catch "Brewing", "meat" must catch "Meats",
// "produce" must catch "ProduceOne", "distribut" must catch "Distributing".
// A field-diag run against real Sept 2025 invoices found these stems fixed
// ~97% of the vendor-name "unclassified" bucket (see OHLQ, Southern Glazer's,
// and *Brewing* vendors below).
const BEV_VENDOR_RE = /\b(wine|spirits?|liquor|ohlq|beer|brew\w*|distribut\w*|beverage|vintner|cellar|heidelberg|cavalier|vintage|winery|glazer\w*)/i;
const FOOD_VENDOR_RE = /\b(food|produce\w*|meat\w*|seafood|fish|bak\w*|bread|dairy|farm\w*|provision|sysco|gordon|hillcrest|us foods|restaurant depot|grocery|butcher|poultry|coffee|giant eagle|market district)/i;

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
// Every order is classified into EXACTLY ONE of food/bev/unclassified, so
// total_invoices = food_invoices + bev_invoices + unclassified_invoices always
// reconciles exactly (no independent totaling, no rounding drift).
export async function syncInvoices(startDate: string, endDate: string, locationName?: string) {
  const supabase = createAdminClient();
  const locations = await mappedLocations(locationName);
  if (locations.length === 0) return { error: 'No mapped locations. Run step=locations first.' };

  const results: Array<Record<string, unknown>> = [];
  for (const loc of locations) {
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: loc.marginedge_id,
    })) as Array<Record<string, unknown>>;

    // month → { food, bev, unclassified } — vendor-name classification
    const byMonth: Record<string, { food: number; bev: number; unclassified: number }> = {};
    for (const o of orders) {
      const invDate = String(o.invoiceDate ?? '').slice(0, 10);
      if (!invDate) continue;
      const ym = invDate.slice(0, 7);
      const amt = Number(o.orderTotal ?? 0);
      const m = (byMonth[ym] ??= { food: 0, bev: 0, unclassified: 0 });
      const type = classifyVendor(String(o.vendorName ?? ''));
      if (type === 'FOOD') m.food += amt;
      else if (type === 'BEV') m.bev += amt;
      else m.unclassified += amt;
    }

    const rows = Object.entries(byMonth).map(([month, v]) => {
      const food = Math.round(v.food * 100) / 100;
      const bev = Math.round(v.bev * 100) / 100;
      const unclassified = Math.round(v.unclassified * 100) / 100;
      return {
        location_id: loc.id, month,
        food_invoices: food,
        bev_invoices: bev,
        unclassified_invoices: unclassified,
        total_invoices: Math.round((food + bev + unclassified) * 100) / 100,
      };
    });
    if (rows.length > 0) {
      await supabase.from('invoice_summary').upsert(rows, { onConflict: 'location_id,month' });
    }
    results.push({ location: loc.name, orders: orders.length, months: rows.length });
  }
  return { range: { startDate, endDate }, results };
}
