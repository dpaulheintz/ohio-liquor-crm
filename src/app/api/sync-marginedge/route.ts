import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  getRestaurantUnits, getCategories, getOrders, getOrderDetail, getProducts, toArray, MarginEdgeError,
} from '@/lib/marginedge/client';

export const maxDuration = 300;

/**
 * GET|POST /api/sync-marginedge
 *
 * Pulls invoice/cost data from the MarginEdge public API into Supabase.
 * Optional shared-secret auth via SYNC_SECRET / CRON_SECRET (matches toast-sync).
 *
 * ?step=
 *   discover  — DRY RUN: returns live restaurantUnits, categories, and a small
 *               orders sample so response shapes can be verified. Writes nothing.
 *   locations — map MarginEdge restaurantUnits → our locations by name and
 *               upsert locations.marginedge_id.
 *   backfill  — aggregate /orders over [startDate,endDate] into daily_costs
 *               (purchase-based proxy) and invoice_summary. Requires locations
 *               to be mapped first.
 *   daily     — backfill for yesterday only (used by the nightly cron).
 *
 * ?startDate=YYYY-MM-DD & ?endDate=YYYY-MM-DD  — range for backfill.
 * ?location=Name  — restrict backfill to one mapped location.
 */

// Beverage-category keyword heuristic (refined after `discover` reveals real
// category names). Everything not matching is treated as food.
const BEV_RE = /\b(beer|wine|liquor|spirit|beverage|bev|alcohol|n\/a bev|na bev|soda|draft)\b/i;

function isAuthorized(req: NextRequest): boolean {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) return true; // auth only enforced when configured
  const auth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return auth === `Bearer ${syncSecret}` || (!!cronSecret && auth === `Bearer ${cronSecret}`);
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const step = sp.get('step') ?? 'discover';

  try {
    if (step === 'discover') return await discover();
    if (step === 'locations') return await mapLocations();
    if (step === 'backfill' || step === 'daily') {
      const { startDate, endDate } = resolveRange(sp, step);
      return await backfill(startDate, endDate, sp.get('location') ?? undefined);
    }
    return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
  } catch (err) {
    const status = err instanceof MarginEdgeError ? (err.status ?? 500) : 500;
    const message = err instanceof Error ? err.message : String(err);
    const body = err instanceof MarginEdgeError ? err.body : undefined;
    return NextResponse.json({ error: message, upstreamBody: body }, { status });
  }
}

function resolveRange(sp: URLSearchParams, step: string): { startDate: string; endDate: string } {
  if (step === 'daily') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const ymd = d.toISOString().slice(0, 10);
    return { startDate: ymd, endDate: ymd };
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    startDate: sp.get('startDate') ?? '2024-01-01',
    endDate: sp.get('endDate') ?? today,
  };
}

// ─── discover: dry-run to verify live shapes ────────────────────────────────────
// Fully defensive: each endpoint is probed independently and its result OR error
// is captured, so one call surfaces every shape even when some endpoints fail.
async function discover(): Promise<NextResponse> {
  const out: Record<string, unknown> = {
    hint: 'DRY RUN — verify field names, then run ?step=locations then ?step=backfill',
  };

  // 1. restaurantUnits (no params). Envelope key is "restaurants".
  let firstUnitId: string | undefined;
  const unitsProbe = await probe(() => getRestaurantUnits());
  if (unitsProbe.ok) {
    const list = toArray(unitsProbe.value, 'restaurants') as Array<Record<string, unknown>>;
    const u0 = list[0] ?? {};
    firstUnitId =
      String(u0.restaurantUnitId ?? u0.restaurantId ?? u0.unitId ?? u0.id ?? '') || undefined;
    out.restaurantUnits = {
      count: list.length,
      sample: list.slice(0, 10),
      unitObjectKeys: firstKeys(u0),
      rawKeys: firstKeys(unitsProbe.value),
    };
  } else {
    out.restaurantUnits = { error: unitsProbe.error };
  }

  // 2. categories (requires restaurantUnitId)
  if (firstUnitId) {
    const catProbe = await probe(() => getCategories(firstUnitId!));
    out.categories = catProbe.ok
      ? { usingUnitId: firstUnitId, count: toArray(catProbe.value, 'categories').length, sample: toArray(catProbe.value, 'categories').slice(0, 40) }
      : { usingUnitId: firstUnitId, error: catProbe.error };
  } else {
    out.categories = { skipped: 'no restaurantUnitId available' };
  }

  // 3. orders sample (pass restaurantUnitId — likely required too)
  let firstOrderId: string | undefined;
  if (firstUnitId) {
    const end = new Date().toISOString().slice(0, 10);
    const startD = new Date(); startD.setDate(startD.getDate() - 30);
    const start = startD.toISOString().slice(0, 10);
    const ordProbe = await probe(() => getOrders({ startDate: start, endDate: end, restaurantUnitId: firstUnitId, pageSize: 5, maxPages: 1 }));
    if (ordProbe.ok) {
      const list = ordProbe.value as Array<Record<string, unknown>>;
      firstOrderId = list[0] ? String(list[0].orderId ?? list[0].id ?? '') || undefined : undefined;
      out.ordersSample = { usingUnitId: firstUnitId, range: { start, end }, count: list.length, sample: list.slice(0, 3) };
    } else {
      out.ordersSample = { usingUnitId: firstUnitId, range: { start, end }, error: ordProbe.error };
    }
  } else {
    out.ordersSample = { skipped: 'no restaurantUnitId available' };
  }

  // 4. order detail (line items → category classification)
  if (firstOrderId) {
    const detProbe = await probe(() => getOrderDetail(firstOrderId!, firstUnitId));
    out.orderDetail = detProbe.ok
      ? { orderId: firstOrderId, rawKeys: firstKeys(detProbe.value), value: detProbe.value }
      : { orderId: firstOrderId, error: detProbe.error };
  } else {
    out.orderDetail = { skipped: 'no orderId available' };
  }

  // 5. products (does the product carry a category?)
  if (firstUnitId) {
    const prodProbe = await probe(() => getProducts(firstUnitId!, 10));
    const list = prodProbe.ok ? toArray(prodProbe.value, 'products') : [];
    out.products = prodProbe.ok
      ? { count: list.length, productObjectKeys: firstKeys(list[0] ?? {}), sample: list.slice(0, 5) }
      : { error: prodProbe.error };
  } else {
    out.products = { skipped: 'no restaurantUnitId available' };
  }

  // 6. categoryId coverage — sample recent orders, fetch details, tally how many
  //    line items actually carry a categoryId (determines if food/bev split is viable)
  if (firstUnitId) {
    const end = new Date().toISOString().slice(0, 10);
    const startD = new Date(); startD.setDate(startD.getDate() - 30);
    const start = startD.toISOString().slice(0, 10);
    const sampleOrders = await probe(() => getOrders({ startDate: start, endDate: end, restaurantUnitId: firstUnitId, pageSize: 12, maxPages: 1 }));
    if (sampleOrders.ok) {
      const orders = (sampleOrders.value as Array<Record<string, unknown>>).slice(0, 12);
      let lineItems = 0, withCategory = 0;
      const catIds = new Set<string>();
      for (const o of orders) {
        const oid = String(o.orderId ?? '');
        if (!oid) continue;
        const det = await probe(() => getOrderDetail(oid, firstUnitId));
        if (!det.ok) continue;
        const items = toArray((det.value as Record<string, unknown>).lineItems);
        for (const li of items as Array<Record<string, unknown>>) {
          lineItems++;
          if (li.categoryId != null && li.categoryId !== '') { withCategory++; catIds.add(String(li.categoryId)); }
        }
      }
      out.categoryCoverage = {
        ordersSampled: orders.length,
        lineItems,
        withCategoryId: withCategory,
        pct: lineItems > 0 ? Math.round((withCategory / lineItems) * 100) : 0,
        distinctCategoryIds: [...catIds].slice(0, 20),
      };
    } else {
      out.categoryCoverage = { error: sampleOrders.error };
    }
  }

  return NextResponse.json({ ok: true, ...out });
}

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const msg = err instanceof MarginEdgeError
      ? `${err.message}${err.body ? ` :: ${err.body}` : ''}`
      : err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function firstKeys(payload: unknown): string[] {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return Object.keys(payload as Record<string, unknown>);
  }
  return Array.isArray(payload) ? ['<array>'] : [];
}

// ─── locations: map restaurantUnits → our locations ─────────────────────────────
async function mapLocations(): Promise<NextResponse> {
  const supabase = createAdminClient();
  const { data: locations } = await supabase.from('locations').select('id, name');
  const unitsPayload = await getRestaurantUnits();
  const units = toArray(unitsPayload, 'restaurants') as Array<Record<string, unknown>>;

  const unitId = (u: Record<string, unknown>) =>
    String(u.restaurantUnitId ?? u.restaurantId ?? u.unitId ?? u.id ?? '');
  const unitName = (u: Record<string, unknown>) =>
    String(u.unitName ?? u.name ?? u.restaurantName ?? '');

  const mapped: Array<{ location: string; marginedge_id: string; unitName: string }> = [];
  const unmatched: Array<{ location: string }> = [];

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
      unmatched.push({ location: String(loc.name) });
    }
  }

  return NextResponse.json({
    ok: true,
    mapped,
    unmatched,
    availableUnits: units.map((u) => ({ id: unitId(u), name: unitName(u) })),
  });
}

// ─── backfill: orders → daily_costs + invoice_summary ───────────────────────────
async function backfill(startDate: string, endDate: string, locationName?: string): Promise<NextResponse> {
  const supabase = createAdminClient();
  let query = supabase.from('locations').select('id, name, marginedge_id').not('marginedge_id', 'is', null);
  if (locationName) query = query.eq('name', locationName);
  const { data: locations } = await query;

  if (!locations || locations.length === 0) {
    return NextResponse.json(
      { error: 'No mapped locations. Run ?step=locations first.' },
      { status: 400 },
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const loc of locations) {
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: String(loc.marginedge_id),
    })) as Array<Record<string, unknown>>;

    // Aggregate by day (daily_costs) and by month/category (invoice_summary).
    const byDay: Record<string, number> = {};
    const byMonth: Record<string, { total: number; food: number; bev: number }> = {};

    for (const o of orders) {
      const invoiceDate = String(o.invoiceDate ?? '').slice(0, 10);
      if (!invoiceDate) continue;
      const amount = Number(o.orderTotal ?? 0);
      const category = String(o.categoryName ?? '');
      const isBev = BEV_RE.test(category);

      byDay[invoiceDate] = (byDay[invoiceDate] ?? 0) + amount;

      const ym = invoiceDate.slice(0, 7);
      const m = (byMonth[ym] ??= { total: 0, food: 0, bev: 0 });
      m.total += amount;
      if (isBev) m.bev += amount; else m.food += amount;
    }

    // Upsert daily_costs (food_cost_pct filled in a follow-up join to daily_sales)
    const dailyRows = Object.entries(byDay).map(([date, cost]) => ({
      location_id: loc.id, date, food_cost: cost, cogs_total: cost,
    }));
    if (dailyRows.length > 0) {
      await supabase.from('daily_costs').upsert(dailyRows, { onConflict: 'location_id,date' });
    }

    // Upsert invoice_summary
    const monthRows = Object.entries(byMonth).map(([month, v]) => ({
      location_id: loc.id, month, total_invoices: v.total, food_invoices: v.food, bev_invoices: v.bev,
    }));
    if (monthRows.length > 0) {
      await supabase.from('invoice_summary').upsert(monthRows, { onConflict: 'location_id,month' });
    }

    results.push({
      location: loc.name,
      orders: orders.length,
      days: dailyRows.length,
      months: monthRows.length,
    });
  }

  // Fill food_cost_pct = food_cost / daily_sales.total_revenue for the range.
  await supabase.rpc('exec_sql', {
    query_text: `UPDATE daily_costs dc SET food_cost_pct =
       CASE WHEN ds.total_revenue > 0 THEN ROUND((dc.food_cost / ds.total_revenue * 100)::numeric, 2) ELSE NULL END
       FROM daily_sales ds
       WHERE ds.location_id = dc.location_id AND ds.business_date = dc.date
         AND dc.date >= '${startDate}' AND dc.date <= '${endDate}'`,
  });

  return NextResponse.json({ ok: true, range: { startDate, endDate }, results });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
