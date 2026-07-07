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

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

/**
 * GET /orders — invoices, filterable by date. Paginated via limit/offset.
 * Fetches every page and returns the concatenated raw records.
 */
export async function getOrders(opts: {
  startDate: string;            // YYYY-MM-DD
  endDate: string;              // YYYY-MM-DD
  restaurantUnitId?: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<unknown[]> {
  const pageSize = opts.pageSize ?? 200;
  const maxPages = opts.maxPages ?? 100;
  const all: unknown[] = [];

  for (let page = 0; page < maxPages; page++) {
    const payload = await meGet('/orders', {
      startDate: opts.startDate,
      endDate: opts.endDate,
      restaurantUnitId: opts.restaurantUnitId,
      limit: pageSize,
      offset: page * pageSize,
    });
    const batch = toArray(payload, 'orders');
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}
