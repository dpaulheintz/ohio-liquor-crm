import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  getRestaurantUnits, getCategories, getOrders, getOrderDetail, getProducts, toArray, MarginEdgeError,
} from '@/lib/marginedge/client';
import { mapLocations, syncCosts, syncInvoices, classifyVendor } from '@/lib/marginedge/sync';

export const maxDuration = 300;

/**
 * GET|POST /api/sync-marginedge
 *
 * Optional shared-secret auth via SYNC_SECRET / CRON_SECRET (matches toast-sync).
 *
 * ?step=
 *   discover   — DRY RUN: live shapes for units/categories/orders/order-detail. No writes.
 *   field-diag — DIAGNOSTIC: tallies distinct order field values (paymentAccount,
 *                status) and lists top vendors landing in the UNCLASSIFIED bucket
 *                by dollar amount. No writes.
 *   locations  — map MarginEdge restaurants → locations.marginedge_id by name.
 *   costs     — daily_costs from the /orders list totals over [startDate,endDate] (cheap).
 *   invoices  — invoice_summary food/bev split via line-item detail (expensive; run per month).
 *   daily     — nightly: costs for yesterday + invoices for the current month.
 *
 * ?startDate=YYYY-MM-DD & ?endDate=YYYY-MM-DD   — range (costs/invoices).
 * ?location=Name                                — restrict to one mapped location.
 */

function isAuthorized(req: NextRequest): boolean {
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) return true;
  const auth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return auth === `Bearer ${syncSecret}` || (!!cronSecret && auth === `Bearer ${cronSecret}`);
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const step = sp.get('step') ?? 'discover';
  const location = sp.get('location') ?? undefined;

  try {
    if (step === 'discover') return await discover();
    if (step === 'field-diag') {
      const { startDate, endDate } = range(sp);
      return await fieldDiag(startDate, endDate, location);
    }
    if (step === 'locations') return NextResponse.json({ ok: true, ...(await mapLocations()) });

    if (step === 'costs') {
      const { startDate, endDate } = range(sp);
      return NextResponse.json({ ok: true, step, ...(await syncCosts(startDate, endDate, location)) });
    }
    if (step === 'invoices') {
      const { startDate, endDate } = range(sp);
      return NextResponse.json({ ok: true, step, ...(await syncInvoices(startDate, endDate, location)) });
    }
    if (step === 'daily') {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yd = y.toISOString().slice(0, 10);
      const monthStart = `${yd.slice(0, 7)}-01`;
      const costs = await syncCosts(yd, yd, location);
      const invoices = await syncInvoices(monthStart, yd, location);
      return NextResponse.json({ ok: true, step, costs, invoices });
    }
    return NextResponse.json({ error: `Unknown step: ${step}` }, { status: 400 });
  } catch (err) {
    const status = err instanceof MarginEdgeError ? (err.status ?? 500) : 500;
    const message = err instanceof Error ? err.message : String(err);
    const body = err instanceof MarginEdgeError ? err.body : undefined;
    return NextResponse.json({ error: message, upstreamBody: body }, { status });
  }
}

function range(sp: URLSearchParams): { startDate: string; endDate: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { startDate: sp.get('startDate') ?? '2024-01-01', endDate: sp.get('endDate') ?? today };
}

// ─── discover: dry-run shape diagnostic ─────────────────────────────────────────
async function discover(): Promise<NextResponse> {
  const out: Record<string, unknown> = { hint: 'DRY RUN — then run steps: locations → costs → invoices' };

  let firstUnitId: string | undefined;
  const unitsProbe = await probe(() => getRestaurantUnits());
  if (unitsProbe.ok) {
    const list = toArray(unitsProbe.value, 'restaurants') as Array<Record<string, unknown>>;
    firstUnitId = list[0] ? String(list[0].id ?? list[0].restaurantUnitId ?? '') || undefined : undefined;
    out.restaurantUnits = { count: list.length, sample: list.slice(0, 10) };
  } else out.restaurantUnits = { error: unitsProbe.error };

  if (firstUnitId) {
    const catProbe = await probe(() => getCategories(firstUnitId!));
    out.categories = catProbe.ok
      ? { count: toArray(catProbe.value, 'categories').length, sample: toArray(catProbe.value, 'categories').slice(0, 8) }
      : { error: catProbe.error };

    const end = new Date().toISOString().slice(0, 10);
    const sd = new Date(); sd.setDate(sd.getDate() - 30);
    const start = sd.toISOString().slice(0, 10);
    const ordProbe = await probe(() => getOrders({ startDate: start, endDate: end, restaurantUnitId: firstUnitId, pageSize: 3, maxPages: 1 }));
    if (ordProbe.ok) {
      const orders = ordProbe.value as Array<Record<string, unknown>>;
      out.ordersSample = { count: orders.length, sample: orders.slice(0, 2) };
      const oid = orders[0] ? String(orders[0].orderId ?? '') : '';
      if (oid) {
        const det = await probe(() => getOrderDetail(oid, firstUnitId));
        out.orderDetail = det.ok ? det.value : { error: det.error };
      }
    } else out.ordersSample = { error: ordProbe.error };

    const prodProbe = await probe(() => getProducts(firstUnitId!, 3));
    out.products = prodProbe.ok
      ? { sample: toArray(prodProbe.value, 'products').slice(0, 2) }
      : { error: prodProbe.error };
  }

  return NextResponse.json({ ok: true, ...out });
}

// ─── field-diag: what does MarginEdge actually return for "category"? ───────────
// The /orders list has no category field at all (only vendorName/orderTotal/
// paymentAccount/status). This tallies every distinct value of every field on a
// real order sample, plus $ totals for vendors our vendor-name classifier leaves
// UNCLASSIFIED, so we can see exactly what's being lumped into that bucket.
async function fieldDiag(startDate: string, endDate: string, locationName?: string): Promise<NextResponse> {
  const supabase = createAdminClient();
  let q = supabase.from('locations').select('id, name, marginedge_id').not('marginedge_id', 'is', null);
  if (locationName) q = q.eq('name', locationName);
  const { data: locations } = await q;
  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: 'No mapped locations.' }, { status: 400 });
  }

  const perLocation: Array<Record<string, unknown>> = [];
  const paymentAccountTotals: Record<string, { count: number; amount: number }> = {};
  const statusTotals: Record<string, { count: number; amount: number }> = {};
  const unclassifiedVendors: Record<string, { count: number; amount: number }> = {};
  const allKeys = new Set<string>();

  for (const loc of locations) {
    const orders = (await getOrders({
      startDate, endDate, restaurantUnitId: String(loc.marginedge_id),
    })) as Array<Record<string, unknown>>;

    let food = 0, bev = 0, unclassified = 0, total = 0;
    for (const o of orders) {
      for (const k of Object.keys(o)) allKeys.add(k);

      const amt = Number(o.orderTotal ?? 0);
      total += amt;

      const pa = String(o.paymentAccount ?? '(none)');
      const paT = (paymentAccountTotals[pa] ??= { count: 0, amount: 0 });
      paT.count++; paT.amount += amt;

      const st = String(o.status ?? '(none)');
      const stT = (statusTotals[st] ??= { count: 0, amount: 0 });
      stT.count++; stT.amount += amt;

      const vendor = String(o.vendorName ?? '(none)');
      const type = classifyVendor(vendor);
      if (type === 'FOOD') food += amt;
      else if (type === 'BEV') bev += amt;
      else {
        unclassified += amt;
        const uv = (unclassifiedVendors[vendor] ??= { count: 0, amount: 0 });
        uv.count++; uv.amount += amt;
      }
    }
    perLocation.push({ location: loc.name, orders: orders.length, total: round2(total), food: round2(food), bev: round2(bev), unclassified: round2(unclassified) });
  }

  const topUnclassifiedVendors = Object.entries(unclassifiedVendors)
    .map(([vendor, v]) => ({ vendor, count: v.count, amount: round2(v.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 30);

  return NextResponse.json({
    ok: true,
    range: { startDate, endDate },
    note: 'No dedicated "category" field exists on /orders — only vendorName/paymentAccount/status. This shows every distinct value found.',
    allOrderFieldNames: [...allKeys].sort(),
    distinctPaymentAccount: Object.entries(paymentAccountTotals).map(([k, v]) => ({ value: k, count: v.count, amount: round2(v.amount) })),
    distinctStatus: Object.entries(statusTotals).map(([k, v]) => ({ value: k, count: v.count, amount: round2(v.amount) })),
    perLocation,
    topUnclassifiedVendorsByAmount: topUnclassifiedVendors,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; }
  catch (err) {
    const msg = err instanceof MarginEdgeError
      ? `${err.message}${err.body ? ` :: ${err.body}` : ''}`
      : err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
