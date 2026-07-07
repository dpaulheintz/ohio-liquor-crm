import { NextRequest, NextResponse } from 'next/server';
import {
  getRestaurantUnits, getCategories, getOrders, getOrderDetail, getProducts, toArray, MarginEdgeError,
} from '@/lib/marginedge/client';
import { mapLocations, syncCosts, syncInvoices } from '@/lib/marginedge/sync';

export const maxDuration = 300;

/**
 * GET|POST /api/sync-marginedge
 *
 * Optional shared-secret auth via SYNC_SECRET / CRON_SECRET (matches toast-sync).
 *
 * ?step=
 *   discover  — DRY RUN: live shapes for units/categories/orders/order-detail. No writes.
 *   locations — map MarginEdge restaurants → locations.marginedge_id by name.
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
