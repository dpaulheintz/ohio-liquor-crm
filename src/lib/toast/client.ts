/**
 * Toast Standard API Client
 *
 * Handles OAuth client-credentials authentication and provides typed
 * methods for the Orders, Labor, and Menus endpoints.
 *
 * Environment variables required:
 *   TOAST_CLIENT_ID        — API client identifier
 *   TOAST_CLIENT_SECRET    — API client secret
 *   TOAST_API_URL          — Base URL (default: https://ws-api.toasttab.com)
 *
 * Each restaurant's Toast GUID must be stored in the `locations` table
 * in the `toast_guid` column.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenResponse {
  token: {
    tokenType: string;
    scope: string;
    expiresIn: number;
    accessToken: string;
    idToken: string;
    refreshToken: string;
  };
  status: string;
}

// ─── Token cache ──────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

// ─── Core client ──────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.TOAST_API_URL ?? 'https://ws-api.toasttab.com';
}

/**
 * Authenticate with Toast using OAuth 2 client-credentials grant.
 * Caches the token until 5 minutes before expiry.
 */
export async function getToastToken(): Promise<string> {
  // Return cached token if still valid (with 5-min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing TOAST_CLIENT_ID or TOAST_CLIENT_SECRET environment variables'
    );
  }

  const url = `${getBaseUrl()}/authentication/v1/authentication/login`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId,
      clientSecret,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Toast auth failed (${res.status}): ${body}`);
  }

  const data: TokenResponse = await res.json();

  if (data.status !== 'SUCCESS') {
    throw new Error(`Toast auth returned status: ${data.status}`);
  }

  cachedToken = data.token.accessToken;
  tokenExpiresAt = Date.now() + data.token.expiresIn * 1000;

  return cachedToken;
}

/**
 * Make an authenticated GET request to a Toast API endpoint.
 *
 * @param path         - API path (e.g. `/orders/v2/ordersBulk`)
 * @param restaurantId - Toast-Restaurant-External-ID (restaurant GUID)
 * @param params       - Query parameters
 */
export async function toastGet<T>(
  path: string,
  restaurantId: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getToastToken();
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
    const body = await res.text();
    throw new Error(`Toast API ${path} failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Paginated fetch helper ───────────────────────────────────────────────────

/**
 * Fetch all pages from a paginated Toast endpoint.
 * Toast uses `page` (0-indexed) and `pageSize` (max 100).
 * Returns all items concatenated.
 */
export async function toastGetAllPages<T>(
  path: string,
  restaurantId: string,
  params: Record<string, string>,
  pageSize = 100
): Promise<T[]> {
  const allItems: T[] = [];
  let page = 0;

  while (true) {
    const pageParams = { ...params, pageSize: String(pageSize), page: String(page) };
    const batch = await toastGet<T[]>(path, restaurantId, pageParams);

    if (!Array.isArray(batch) || batch.length === 0) break;

    allItems.push(...batch);

    // If we got fewer than pageSize, we've reached the last page
    if (batch.length < pageSize) break;

    page++;
  }

  return allItems;
}

// ─── Orders API ───────────────────────────────────────────────────────────────

/** Minimal order shape — we only extract what we need for daily_sales */
export interface ToastOrder {
  guid: string;
  businessDate: number;    // yyyymmdd integer
  openedDate: string;      // ISO-8601
  closedDate: string | null;
  checks: ToastCheck[];
  numberOfGuests: number;
  voided: boolean;
  deleted: boolean;
}

export interface ToastCheck {
  guid: string;
  totalAmount: number;
  amount: number;           // subtotal before tax
  taxAmount: number;
  selections: ToastSelection[];
  appliedDiscounts: ToastAppliedDiscount[];
  voided: boolean;
  deleted: boolean;
}

export interface ToastSelection {
  guid: string;
  itemGuid: string | null;  // reference to menu item
  displayName: string;
  quantity: number;
  price: number;
  voided: boolean;
  deselected: boolean;
}

export interface ToastAppliedDiscount {
  discountAmount: number;
  name: string;
}

/**
 * Fetch all orders for a restaurant in a date range.
 * Toast requires ISO-8601 timestamps for startDate/endDate.
 * Max range per request varies; we paginate with pageSize=100.
 */
export async function fetchOrders(
  restaurantId: string,
  startDate: string,  // ISO-8601 e.g. "2024-01-01T00:00:00.000Z"
  endDate: string     // ISO-8601
): Promise<ToastOrder[]> {
  return toastGetAllPages<ToastOrder>(
    '/orders/v2/ordersBulk',
    restaurantId,
    { startDate, endDate }
  );
}

// ─── Labor API ────────────────────────────────────────────────────────────────

export interface ToastTimeEntry {
  guid: string;
  employeeReference: { guid: string };
  jobReference: { guid: string } | null;
  inDate: string;              // ISO-8601
  outDate: string | null;
  autoClockedOut: boolean;
  regularHours: number;
  overtimeHours: number;
  hourlyWage: number;
  declaredCashTips: number;
  nonCashTips: number;
  nonCashGratuityServiceCharges: number;
  cashGratuityServiceCharges: number;
}

/**
 * Fetch time entries for a restaurant.
 * Uses businessDate (yyyymmdd) or startDate/endDate (ISO-8601, max 1 month).
 */
export async function fetchTimeEntries(
  restaurantId: string,
  startDate: string,
  endDate: string
): Promise<ToastTimeEntry[]> {
  return toastGet<ToastTimeEntry[]>(
    '/labor/v1/timeEntries',
    restaurantId,
    { startDate, endDate }
  );
}

// ─── Menus API ────────────────────────────────────────────────────────────────

export interface ToastMenu {
  name: string;
  guid: string;
  groups: ToastMenuGroup[];
}

export interface ToastMenuGroup {
  name: string;
  guid: string;
  items: ToastMenuItem[];
}

export interface ToastMenuItem {
  name: string;
  guid: string;
  price: number | null;
  plu: string | null;     // PLU / SKU code
  calories: number | null;
}

/**
 * Fetch the full resolved menu tree for a restaurant.
 * Returns the raw API response — caller must handle shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchMenus(restaurantId: string): Promise<any> {
  return toastGet<unknown>('/menus/v2/menus', restaurantId);
}

/**
 * Flatten whatever Toast returns into a flat list of menu items.
 * Handles: array of menus, single menu object, or nested structures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenMenuItems(raw: any): { guid: string; name: string; price: number | null; menuName: string; groupName: string }[] {
  const results: { guid: string; name: string; price: number | null; menuName: string; groupName: string }[] = [];

  // Normalize to array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let menus: any[];
  if (Array.isArray(raw)) {
    menus = raw;
  } else if (raw && typeof raw === 'object') {
    // Could be { menus: [...] } or a single menu object
    menus = raw.menus ?? raw.data ?? [raw];
  } else {
    return results;
  }

  for (const menu of menus) {
    const menuName = menu.name ?? 'Uncategorized';
    const groups = menu.groups ?? menu.menuGroups ?? [];
    if (!Array.isArray(groups)) continue;

    for (const group of groups) {
      const groupName = group.name ?? 'Ungrouped';
      const items = group.items ?? group.menuItems ?? [];
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item.guid) continue;
        results.push({
          guid: item.guid,
          name: item.name ?? item.displayName ?? 'Unknown',
          price: item.price ?? null,
          menuName,
          groupName,
        });
      }
    }
  }

  return results;
}
