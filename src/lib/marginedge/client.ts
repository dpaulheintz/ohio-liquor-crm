/**
 * MarginEdge public API client.
 *
 * Docs: https://developer.marginedge.com
 * Base URL: https://api.marginedge.com/public   (note: no /v1)
 * Auth:    X-Api-Key: <MARGINEDGE_API_KEY>  request header
 * Shape:   read-only; invoices ("orders"), products, vendors, restaurantUnits
 *
 * The public API exposes invoice/purchase data, NOT computed COGS or recipe
 * costs — callers that need cost % must derive it from purchases + revenue.
 */

export const ME_BASE = 'https://api.marginedge.com/public';

export class MarginEdgeError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
    this.name = 'MarginEdgeError';
  }
}

function apiKey(): string {
  const key = process.env.MARGINEDGE_API_KEY;
  if (!key) throw new MarginEdgeError('MARGINEDGE_API_KEY is not set');
  return key;
}

/**
 * Low-level GET with X-Api-Key auth and 429 backoff.
 * Returns parsed JSON of unknown shape — callers narrow it.
 */
async function meGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  const url = new URL(`${ME_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Global pacing: small delay before every call to stay under the rate limit.
    await new Promise((r) => setTimeout(r, 150));
    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': apiKey(), Accept: 'application/json' },
    });

    if (res.status === 429 && attempt < maxAttempts) {
      // Exponential backoff: 2s, 4s, 8s
      const wait = 2000 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new MarginEdgeError(
        `MarginEdge GET ${path} failed: ${res.status}`,
        res.status,
        text.slice(0, 500),
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new MarginEdgeError(`MarginEdge GET ${path} returned non-JSON`, res.status, text.slice(0, 500));
    }
  }
  throw new MarginEdgeError(`MarginEdge GET ${path} exhausted retries (429)`);
}

/**
 * Response envelopes from this API vary (bare array vs { data: [] } vs a named
 * key like { restaurantUnits: [] }). Normalize to an array defensively.
 */
export function toArray(payload: unknown, namedKey?: string): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (namedKey && Array.isArray(obj[namedKey])) return obj[namedKey] as unknown[];
    if (Array.isArray(obj.data)) return obj.data as unknown[];
    if (Array.isArray(obj.results)) return obj.results as unknown[];
    if (Array.isArray(obj.items)) return obj.items as unknown[];
  }
  return [];
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** GET /restaurantUnits — locations (restaurantUnitId, unitName). */
export async function getRestaurantUnits(): Promise<unknown> {
  return meGet('/restaurantUnits');
}

/** GET /categories — spend/GL categories (requires restaurantUnitId). */
export async function getCategories(restaurantUnitId: string): Promise<unknown> {
  return meGet('/categories', { restaurantUnitId });
}

/** GET /orders/{orderId} — single invoice with line items (category detail). */
export async function getOrderDetail(orderId: string, restaurantUnitId?: string): Promise<unknown> {
  return meGet(`/orders/${orderId}`, { restaurantUnitId });
}

/** GET /products — product catalog (may carry category per product). */
export async function getProducts(restaurantUnitId: string, limit = 20, offset = 0): Promise<unknown> {
  return meGet('/products', { restaurantUnitId, limit, offset });
}

/**
 * GET /orders — invoices, filterable by date. Paginated via limit/offset.
 * Fetches every page and returns the concatenated raw records.
 */
// The API caps a response at 100 rows and IGNORES offset (paging by offset just
// re-returns the same first 100). So instead of offset pagination we fetch a
// date window; if it hits the 100 cap we split the window in half and recurse.
// Results are de-duplicated by orderId. Invoice volume is low (~1-3/day) so most
// windows resolve in a single call.
const ORDERS_CAP = 100;

export async function getOrders(opts: {
  startDate: string;            // YYYY-MM-DD
  endDate: string;              // YYYY-MM-DD
  restaurantUnitId?: string;
  pageSize?: number;            // unused (kept for call-site compatibility)
  maxPages?: number;            // unused
}): Promise<unknown[]> {
  const seen = new Map<string, Record<string, unknown>>();
  await collectOrders(opts.startDate, opts.endDate, opts.restaurantUnitId, seen, 0);
  return [...seen.values()];
}

async function collectOrders(
  start: string,
  end: string,
  restaurantUnitId: string | undefined,
  seen: Map<string, Record<string, unknown>>,
  depth: number,
): Promise<void> {
  const payload = await meGet('/orders', { startDate: start, endDate: end, restaurantUnitId, limit: 500 });
  const batch = toArray(payload, 'orders') as Array<Record<string, unknown>>;

  // Under the cap (or window is a single day, or too deep) — take what we got.
  if (batch.length < ORDERS_CAP || start >= end || depth >= 12) {
    for (const o of batch) {
      const id = String(o.orderId ?? '');
      if (id) seen.set(id, o);
    }
    return;
  }

  // Cap hit — split the window at the midpoint date and recurse into both halves.
  const mid = midpointDate(start, end);
  const nextDay = addDays(mid, 1);
  await collectOrders(start, mid, restaurantUnitId, seen, depth + 1);
  await collectOrders(nextDay, end, restaurantUnitId, seen, depth + 1);
}

function midpointDate(start: string, end: string): string {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return new Date(s + Math.floor((e - s) / 2)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
