/**
 * Toast Analytics API Client
 *
 * Uses the async report pattern:
 *   1. POST to create a report request → reportRequestGuid
 *   2. GET to poll until 200 (data ready) or timeout
 *
 * Environment variables:
 *   TOAST_ANALYTICS_CLIENT_ID     — Analytics API client identifier
 *   TOAST_ANALYTICS_CLIENT_SECRET — Analytics API client secret
 *   TOAST_API_URL                 — Base URL (default: https://ws-api.toasttab.com)
 */

// ─── Token cache (dual: analytics + standard) ────────────────────────────────

interface TokenCache {
  token: string | null;
  expiresAt: number;
}

const analyticsCache: TokenCache = { token: null, expiresAt: 0 };
const standardCache: TokenCache = { token: null, expiresAt: 0 };

function getBaseUrl(): string {
  return process.env.TOAST_API_URL ?? 'https://ws-api.toasttab.com';
}

// ─── Authentication ───────────────────────────────────────────────────────────

async function authenticate(
  clientId: string,
  clientSecret: string,
  cache: TokenCache
): Promise<string> {
  if (cache.token && Date.now() < cache.expiresAt - 5 * 60 * 1000) {
    return cache.token;
  }

  const res = await fetch(
    `${getBaseUrl()}/authentication/v1/authentication/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Toast auth failed (${res.status}): ${body}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  if (data.status !== 'SUCCESS') {
    throw new Error(`Toast auth status: ${data.status}`);
  }

  cache.token = data.token.accessToken;
  cache.expiresAt = Date.now() + data.token.expiresIn * 1000;
  return cache.token!;
}

/** Analytics API token (for /era/v1/* reports) */
export async function getToastToken(): Promise<string> {
  const id = process.env.TOAST_ANALYTICS_CLIENT_ID;
  const secret = process.env.TOAST_ANALYTICS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing TOAST_ANALYTICS_CLIENT_ID or TOAST_ANALYTICS_CLIENT_SECRET');
  return authenticate(id, secret, analyticsCache);
}

/** Standard API token (for /orders/v2/*, /menus/v2/*, /labor/v1/*) */
export async function getStandardToken(): Promise<string> {
  const id = process.env.TOAST_CLIENT_ID;
  const secret = process.env.TOAST_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Missing TOAST_CLIENT_ID or TOAST_CLIENT_SECRET');
  return authenticate(id, secret, standardCache);
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

async function toastPost<T>(path: string, body: unknown): Promise<T> {
  const token = await getToastToken();
  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

/** GET using Analytics API credentials */
export async function toastGet<T>(
  path: string,
  restaurantId?: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getToastToken();
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (restaurantId) {
    headers['Toast-Restaurant-External-ID'] = restaurantId;
  }
  const res = await fetch(url.toString(), { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

/** GET using Standard API credentials (for /orders/v2/*, /menus/v2/*) */
export async function toastGetStandard<T>(
  path: string,
  restaurantId: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getStandardToken();
  const url = new URL(path, getBaseUrl());
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Toast-Restaurant-External-ID': restaurantId,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Toast Standard GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Async report pattern ─────────────────────────────────────────────────────

/**
 * POST to create a report request, then poll GET until data is ready.
 * Returns the parsed response body on 200.
 * Throws on 409 (failed) or timeout.
 */
export async function requestAndPollReport<T>(
  postPath: string,
  getPathPrefix: string,
  body: unknown,
  maxPollMs = 30_000,
  pollIntervalMs = 2_000
): Promise<T> {
  // POST → get reportRequestGuid (returned as a plain string with quotes)
  const guidRaw = await toastPost<string>(postPath, body);
  // Toast returns the GUID as a quoted string like "abc-123"
  const guid = typeof guidRaw === 'string' ? guidRaw.replace(/"/g, '') : String(guidRaw);

  if (!guid || guid.length < 10) {
    throw new Error(`Invalid reportRequestGuid from ${postPath}: ${guid}`);
  }

  // Poll GET until 200
  const deadline = Date.now() + maxPollMs;
  while (Date.now() < deadline) {
    const token = await getToastToken();
    const url = `${getBaseUrl()}${getPathPrefix}/${guid}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 200) {
      return res.json() as Promise<T>;
    }
    if (res.status === 202) {
      // Still processing — wait and retry
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }
    if (res.status === 409) {
      throw new Error(`Report request failed (409) — need new request`);
    }
    const text = await res.text();
    throw new Error(`Report poll ${url} failed (${res.status}): ${text}`);
  }

  throw new Error(`Report poll timed out after ${maxPollMs}ms`);
}

// ─── Analytics report types ───────────────────────────────────────────────────

/** Date as YYYYMMDD string */
function toToastDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

export interface ReportRequest {
  startBusinessDate: string; // YYYYMMDD
  endBusinessDate: string;   // YYYYMMDD
  restaurantIds: string[];
  excludedRestaurantIds: string[];
  groupBy: string[];
}

// ── Aggregated Sales (metrics) ────────────────────────────────────────────────

export interface MetricsRow {
  restaurantGuid: string;
  businessDate: string;        // YYYYMMDD
  guestCount: number;
  ordersCount: number;
  closedOrderCount: number;
  netSalesAmount: number;
  grossSalesAmount: number;
  discountAmount: number;
  voidOrdersAmount: number;
  refundAmount: number;
  hourlyJobTotalHours: string;  // returned as string
  hourlyJobTotalPay: string;    // returned as string
}

export async function fetchMetrics(
  restaurantIds: string[],
  startDate: string,   // YYYY-MM-DD
  endDate: string
): Promise<MetricsRow[]> {
  const body: ReportRequest = {
    startBusinessDate: toToastDate(startDate),
    endBusinessDate: toToastDate(endDate),
    restaurantIds,
    excludedRestaurantIds: [],
    groupBy: [],
  };
  return requestAndPollReport<MetricsRow[]>(
    '/era/v1/metrics',
    '/era/v1/metrics',
    body
  );
}

// ── Labor ─────────────────────────────────────────────────────────────────────

export interface LaborRow {
  restaurantGuid: string;
  businessDate: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  regularCost: number;
  overtimeCost: number;
  totalCost: number;
  jobGuid?: string;
  jobTitle?: string;
}

export async function fetchLabor(
  restaurantIds: string[],
  startDate: string,
  endDate: string
): Promise<LaborRow[]> {
  const body: ReportRequest = {
    startBusinessDate: toToastDate(startDate),
    endBusinessDate: toToastDate(endDate),
    restaurantIds,
    excludedRestaurantIds: [],
    groupBy: [],
  };
  return requestAndPollReport<LaborRow[]>(
    '/era/v1/labor',
    '/era/v1/labor',
    body
  );
}

// ── Menu item sales (via Analytics menu report) ───────────────────────────────

export interface MenuItemRow {
  restaurantGuid: string;
  businessDate: string;
  menuItemGuid?: string;
  menuItemName?: string;
  menuGroupGuid?: string;
  menuGroupName?: string;
  quantitySold: number;
  grossSalesAmount: number;
  netSalesAmount: number;
  discountAmount: number;
}

export async function fetchMenuItemSales(
  restaurantIds: string[],
  startDate: string,
  endDate: string
): Promise<MenuItemRow[]> {
  // Try with MENU_ITEM groupBy first
  try {
    const body: ReportRequest = {
      startBusinessDate: toToastDate(startDate),
      endBusinessDate: toToastDate(endDate),
      restaurantIds,
      excludedRestaurantIds: [],
      groupBy: ['MENU_ITEM'],
    };
    return await requestAndPollReport<MenuItemRow[]>(
      '/era/v1/menu',
      '/era/v1/menu',
      body
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If groupBy not supported, fall back to orders API for item data
    if (msg.includes('groupBy') || msg.includes('400')) {
      // groupBy not supported — falling back to orders API
      return fetchItemsFromOrders(restaurantIds, startDate, endDate);
    }
    throw err;
  }
}

// ── Fallback: extract item sales from Standard API orders ─────────────────────

interface ToastOrderSelection {
  item: { guid: string } | null;
  displayName: string;
  quantity: number;
  price: number;
  voided: boolean;
  deselected: boolean;
}

interface ToastOrderCheck {
  totalAmount: number;
  selections: ToastOrderSelection[];
  voided: boolean;
  deleted: boolean;
}

interface ToastOrderBulk {
  businessDate: number;
  checks: ToastOrderCheck[];
  voided: boolean;
  deleted: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

async function fetchItemsFromOrders(
  restaurantIds: string[],
  startDate: string,
  endDate: string
): Promise<MenuItemRow[]> {
  const results: MenuItemRow[] = [];
  const dates: string[] = [];

  // Generate date list
  const d = new Date(startDate + 'T00:00:00');
  const ed = new Date(endDate + 'T00:00:00');
  while (d <= ed) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  for (const restaurantId of restaurantIds) {
    for (const dateStr of dates) {
      const bizDate = dateStr.replace(/-/g, '');
      let orders: ToastOrderBulk[];
      try {
        orders = await toastGet<ToastOrderBulk[]>(
          '/orders/v2/ordersBulk',
          restaurantId,
          { businessDate: bizDate }
        );
      } catch {
        continue;
      }

      if (!Array.isArray(orders) || orders.length === 0) continue;

      // Aggregate items for this day
      const dayItems = new Map<string, { name: string; qty: number; rev: number }>();
      for (const order of orders) {
        if (order.voided || order.deleted) continue;
        for (const check of order.checks ?? []) {
          if (check.voided || check.deleted) continue;
          for (const sel of check.selections ?? []) {
            if (sel.voided || sel.deselected) continue;
            const guid = sel.item?.guid;
            if (!guid) continue;
            const e = dayItems.get(guid) ?? { name: sel.displayName ?? 'Unknown', qty: 0, rev: 0 };
            e.qty += sel.quantity ?? 1;
            e.rev += sel.price ?? 0;
            dayItems.set(guid, e);
          }
        }
      }

      for (const [guid, agg] of dayItems) {
        results.push({
          restaurantGuid: restaurantId,
          businessDate: bizDate,
          menuItemGuid: guid,
          menuItemName: agg.name,
          quantitySold: agg.qty,
          grossSalesAmount: agg.rev,
          netSalesAmount: agg.rev,
          discountAmount: 0,
        });
      }

      // Brief rate-limit pause
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
}
