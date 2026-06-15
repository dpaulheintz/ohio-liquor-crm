/**
 * Toast Analytics API → Supabase Sync
 *
 * Uses the Analytics API async report pattern:
 *   POST to create report → poll GET until ready → parse results
 *
 * Three report types per location per date range:
 *   1. Metrics  → daily_sales (revenue, guests, checks, labor)
 *   2. Menu     → menu_items + daily_item_sales (item name, qty, revenue)
 *
 * Two modes:
 *   - daily:    yesterday only
 *   - backfill: custom date range (default: Jan 1 2024 → today)
 *
 * The Analytics API supports multi-day ranges natively, so we don't
 * need to loop day-by-day. We chunk into 30-day windows to stay
 * within API limits and Vercel timeouts.
 */

import { createAdminClient } from '@/lib/supabase/server';
import {
  fetchMetrics,
  fetchMenuItemSales,
  type MetricsRow,
  type MenuItemRow,
} from './client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const d = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/** Convert YYYYMMDD to YYYY-MM-DD */
function toIsoDate(yyyymmdd: string): string {
  if (yyyymmdd.includes('-')) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Break a date range into chunks of maxDays each */
function chunkDateRange(start: string, end: string, maxDays: number): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  const dates = dateRange(start, end);
  for (let i = 0; i < dates.length; i += maxDays) {
    const chunkDates = dates.slice(i, i + maxDays);
    chunks.push({ start: chunkDates[0], end: chunkDates[chunkDates.length - 1] });
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Location loader ──────────────────────────────────────────────────────────

interface Location {
  id: string;
  name: string;
  toast_guid: string;
}

async function getActiveLocations(): Promise<Location[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, toast_guid')
    .eq('is_active', true)
    .not('toast_guid', 'is', null);
  if (error) throw new Error(`Failed to load locations: ${error.message}`);
  return (data ?? []) as Location[];
}

// ─── Metrics → daily_sales ────────────────────────────────────────────────────

async function syncMetrics(
  locations: Location[],
  start: string,
  end: string
): Promise<number> {
  const supabase = createAdminClient();
  const restaurantIds = locations.map((l) => l.toast_guid);
  const guidToId = new Map(locations.map((l) => [l.toast_guid, l.id]));

  let rows: MetricsRow[];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      rows = await fetchMetrics(restaurantIds, start, end);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') && attempt < 2) {
        await sleep((attempt + 1) * 10 * 1000);
        continue;
      }
      throw new Error(`Metrics fetch failed: ${msg}`);
    }
  }
  // @ts-expect-error rows is assigned in the loop above
  if (!rows) return 0;
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    const locationId = guidToId.get(row.restaurantGuid);
    if (!locationId) continue;

    const { error } = await supabase
      .from('daily_sales')
      .upsert(
        {
          location_id: locationId,
          business_date: toIsoDate(row.businessDate),
          fnb_revenue: row.netSalesAmount ?? 0,
          total_revenue: row.grossSalesAmount ?? 0,
          guest_count: row.guestCount ?? 0,
          check_count: row.ordersCount ?? row.closedOrderCount ?? 0,
          labor_cost: row.hourlyJobTotalPay ? parseFloat(row.hourlyJobTotalPay) : null,
          labor_hours: row.hourlyJobTotalHours ? parseFloat(row.hourlyJobTotalHours) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'location_id,business_date' }
      );
    if (error) { /* upsert error — row skipped */ }
    else count++;
  }

  return count;
}

// ─── Item sales → menu_items + daily_item_sales (Standard API orders) ────────

async function syncItemSales(
  locations: Location[],
  start: string,
  end: string
): Promise<{ menuItems: number; itemSales: number }> {
  const supabase = createAdminClient();
  const restaurantIds = locations.map((l) => l.toast_guid);
  const guidToId = new Map(locations.map((l) => [l.toast_guid, l.id]));

  // fetchMenuItemSales → fetchItemsFromOrders (Standard API /orders/v2/ordersBulk)
  // Per-day errors are swallowed internally; surface a top-level error only on total failure.
  const rows = await fetchMenuItemSales(restaurantIds, start, end);
  if (!Array.isArray(rows) || rows.length === 0) return { menuItems: 0, itemSales: 0 };

  // Step 1: Collect unique menu items per location
  const menuItemsByLocation = new Map<string, Map<string, string>>(); // locationId → (toastGuid → name)
  for (const row of rows) {
    const locationId = guidToId.get(row.restaurantGuid);
    if (!locationId || !row.menuItemGuid) continue;
    if (!menuItemsByLocation.has(locationId)) {
      menuItemsByLocation.set(locationId, new Map());
    }
    menuItemsByLocation.get(locationId)!.set(row.menuItemGuid, row.menuItemName ?? row.menuItemGuid);
  }

  // Step 2: Batch upsert menu_items per location
  for (const [locationId, items] of menuItemsByLocation) {
    const menuRows = [...items.entries()].map(([guid, name]) => ({
      location_id: locationId,
      toast_guid: guid,
      name,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('menu_items').upsert(menuRows, { onConflict: 'location_id,toast_guid' });
  }

  // Step 3: Fetch all menu_item ids for these locations in one query
  const locationIds = [...menuItemsByLocation.keys()];
  const { data: menuItemsData } = await supabase
    .from('menu_items')
    .select('id, location_id, toast_guid')
    .in('location_id', locationIds);

  // Build lookup: `${locationId}:${toastGuid}` → menu_item_id
  const menuItemLookup = new Map<string, string>();
  for (const mi of menuItemsData ?? []) {
    menuItemLookup.set(`${mi.location_id}:${mi.toast_guid}`, mi.id);
  }

  // Step 4: Build batch of daily_item_sales rows
  const salesRows = [];
  for (const row of rows) {
    const locationId = guidToId.get(row.restaurantGuid);
    if (!locationId || !row.menuItemGuid) continue;
    const menuItemId = menuItemLookup.get(`${locationId}:${row.menuItemGuid}`);
    if (!menuItemId) continue;
    salesRows.push({
      location_id: locationId,
      menu_item_id: menuItemId,
      business_date: toIsoDate(row.businessDate),
      quantity_sold: row.quantitySold,
      gross_revenue: row.grossSalesAmount,
    });
  }

  // Step 5: Batch upsert daily_item_sales in chunks of 500
  let itemSalesCount = 0;
  const BATCH = 500;
  for (let i = 0; i < salesRows.length; i += BATCH) {
    const batch = salesRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('daily_item_sales')
      .upsert(batch, { onConflict: 'location_id,menu_item_id,business_date' });
    if (!error) itemSalesCount += batch.length;
  }

  const menuItemCount = [...menuItemsByLocation.values()].reduce((sum, items) => sum + items.size, 0);
  return { menuItems: menuItemCount, itemSales: itemSalesCount };
}

// ─── Sync log ─────────────────────────────────────────────────────────────────

async function writeSyncLog(
  source: string,
  syncType: string,
  status: string,
  rowsAffected: number,
  message: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('sync_log').insert({
    source,
    sync_type: syncType,
    status,
    rows_affected: rowsAffected,
    message,
  });
}

// ─── Main sync orchestrator ───────────────────────────────────────────────────

export interface SyncResult {
  locations: string[];
  dateRange: string;
  metricsRows: number;
  laborUpdates: number;
  menuItems: number;
  itemSalesRows: number;
  errors: string[];
}

export interface SyncOptions {
  mode: 'daily' | 'backfill';
  locationFilter?: string;
  startDate?: string;
  endDate?: string;
  /** Run only a specific step: "metrics", "items", or "all" (default) */
  step?: 'metrics' | 'items' | 'all';
}

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  let locations = await getActiveLocations();

  if (opts.locationFilter) {
    locations = locations.filter(
      (l) => l.name.toLowerCase() === opts.locationFilter!.toLowerCase()
    );
    if (locations.length === 0) {
      throw new Error(`No active location matching "${opts.locationFilter}"`);
    }
  }

  // Determine date range
  let start: string, end: string;
  if (opts.mode === 'backfill') {
    start = opts.startDate ?? '2024-01-01';
    end = opts.endDate ?? new Date().toISOString().slice(0, 10);
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    start = end = yesterday.toISOString().slice(0, 10);
  }

  const step = opts.step ?? 'all';
  const result: SyncResult = {
    locations: locations.map((l) => l.name),
    dateRange: `${start} → ${end}`,
    metricsRows: 0,
    laborUpdates: 0,
    menuItems: 0,
    itemSalesRows: 0,
    errors: [],
  };

  // Metrics: single Analytics API call per chunk — 30-day windows are fine
  if (step === 'all' || step === 'metrics') {
    const metricsChunks = chunkDateRange(start, end, 30);
    for (let i = 0; i < metricsChunks.length; i++) {
      const chunk = metricsChunks[i];
      try {
        result.metricsRows += await syncMetrics(locations, chunk.start, chunk.end);
      } catch (err) {
        result.errors.push(`Metrics ${chunk.start}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (i < metricsChunks.length - 1) await sleep(3000);
    }
  }

  // Items: Standard API loops day-by-day — keep chunks at 7 days to stay within Vercel timeout
  if (step === 'all' || step === 'items') {
    const itemChunks = chunkDateRange(start, end, 7);
    for (let i = 0; i < itemChunks.length; i++) {
      const chunk = itemChunks[i];
      try {
        const { menuItems, itemSales } = await syncItemSales(locations, chunk.start, chunk.end);
        result.menuItems += menuItems;
        result.itemSalesRows += itemSales;
      } catch (err) {
        result.errors.push(`Items ${chunk.start}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (i < itemChunks.length - 1) await sleep(2000);
    }
  }

  const totalRows = result.metricsRows + result.laborUpdates + result.menuItems + result.itemSalesRows;
  const hasErrors = result.errors.length > 0;

  await writeSyncLog(
    'toast-analytics',
    opts.mode,
    hasErrors ? 'partial' : 'success',
    totalRows,
    `${result.locations.join(', ')}: ${result.metricsRows} metrics, ${result.menuItems} menu, ${result.itemSalesRows} item sales${hasErrors ? ` (${result.errors.length} errors)` : ''}`
  );

  return result;
}
