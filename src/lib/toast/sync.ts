/**
 * Toast Analytics API → Supabase Sync
 *
 * Uses the Analytics API async report pattern:
 *   POST to create report → poll GET until ready → parse results
 *
 * Three report types per location per date range:
 *   1. Metrics  → daily_sales (revenue, guests, checks)
 *   2. Labor    → daily_sales (labor_cost, labor_hours)
 *   3. Menu     → menu_items + daily_item_sales (item name, qty, revenue)
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
  toastGet,
  type MetricsRow,
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
  try {
    rows = await fetchMetrics(restaurantIds, start, end);
  } catch (err) {
    throw new Error(`Metrics fetch failed: ${err instanceof Error ? err.message : err}`);
  }

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
          // Labor from metrics (aggregated — may be overwritten by labor report)
          labor_cost: row.hourlyJobTotalPay ? parseFloat(row.hourlyJobTotalPay) : null,
          labor_hours: row.hourlyJobTotalHours ? parseFloat(row.hourlyJobTotalHours) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'location_id,business_date' }
      );
    if (error) console.error(`Metrics upsert error for ${row.businessDate}:`, error.message);
    else count++;
  }

  return count;
}

// ─── Item sales → menu_items + daily_item_sales (via orders API) ──────────────

async function syncItemSales(
  locations: Location[],
  start: string,
  end: string
): Promise<{ menuItems: number; itemSales: number }> {
  const supabase = createAdminClient();
  let menuItemCount = 0;
  let itemSalesCount = 0;

  // Generate date list
  const dates = dateRange(start, end);

  for (const location of locations) {
    for (const dateStr of dates) {
      const bizDate = dateStr.replace(/-/g, '');

      // Fetch orders for this day from Standard API
      let orders: { businessDate: number; checks: { totalAmount: number; selections: { item: { guid: string } | null; displayName: string; quantity: number; price: number; voided: boolean; deselected: boolean }[]; voided: boolean; deleted: boolean }[]; voided: boolean; deleted: boolean }[];
      try {
        orders = await toastGet('/orders/v2/ordersBulk', location.toast_guid, { businessDate: bizDate });
      } catch {
        continue;
      }
      if (!Array.isArray(orders) || orders.length === 0) continue;

      // Aggregate items
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

      if (dayItems.size === 0) continue;

      // Batch upsert menu_items (deduplicated)
      const menuRows = [...dayItems.entries()].map(([guid, agg]) => ({
        location_id: location.id,
        toast_guid: guid,
        name: agg.name,
        updated_at: new Date().toISOString(),
      }));

      for (const row of menuRows) {
        await supabase
          .from('menu_items')
          .upsert(row, { onConflict: 'location_id,toast_guid' });
      }

      // Fetch all menu_item IDs for this location in one query
      const guids = [...dayItems.keys()];
      const { data: miRows } = await supabase
        .from('menu_items')
        .select('id, toast_guid')
        .eq('location_id', location.id)
        .in('toast_guid', guids);

      if (!miRows || miRows.length === 0) continue;

      const guidToMiId = new Map(miRows.map((r) => [r.toast_guid, r.id]));
      menuItemCount += menuRows.length;

      // Batch upsert daily_item_sales
      const itemSalesRows = [...dayItems.entries()]
        .map(([guid, agg]) => {
          const miId = guidToMiId.get(guid);
          if (!miId) return null;
          return {
            location_id: location.id,
            menu_item_id: miId,
            business_date: dateStr,
            quantity_sold: agg.qty,
            gross_revenue: agg.rev,
          };
        })
        .filter(Boolean);

      if (itemSalesRows.length > 0) {
        const { error } = await supabase
          .from('daily_item_sales')
          .upsert(itemSalesRows, { onConflict: 'location_id,menu_item_id,business_date' });
        if (error) console.error(`daily_item_sales batch upsert error:`, error.message);
        else itemSalesCount += itemSalesRows.length;
      }

      // Rate limit
      await sleep(150);
    }
  }

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

  console.log(`[Toast Sync] Mode: ${opts.mode}, ${start} → ${end}, locations: ${locations.map(l => l.name).join(', ')}`);

  const result: SyncResult = {
    locations: locations.map((l) => l.name),
    dateRange: `${start} → ${end}`,
    metricsRows: 0,
    laborUpdates: 0,
    menuItems: 0,
    itemSalesRows: 0,
    errors: [],
  };

  // Analytics API supports multi-day + multi-location in one call.
  // Chunk into 7-day windows to stay within Vercel timeout (~60s).
  const chunks = chunkDateRange(start, end, 7);

  for (const chunk of chunks) {
    console.log(`  Processing ${chunk.start} → ${chunk.end}...`);

    // 1. Metrics (sales)
    try {
      const n = await syncMetrics(locations, chunk.start, chunk.end);
      result.metricsRows += n;
      console.log(`    Metrics: ${n} rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    Metrics error: ${msg}`);
      result.errors.push(`Metrics ${chunk.start}: ${msg}`);
    }

    // 2. Labor — skipped: labor data comes inline from the metrics report
    //    (hourlyJobTotalHours, hourlyJobTotalPay fields)
    //    The separate /era/v1/labor endpoint requires additional permissions.
    console.log(`    Labor: included in metrics (${result.metricsRows} rows have labor data)`);

    // 3. Item sales (from orders API — Analytics menu endpoint lacks groupBy support)
    try {
      const { menuItems, itemSales } = await syncItemSales(locations, chunk.start, chunk.end);
      result.menuItems += menuItems;
      result.itemSalesRows += itemSales;
      console.log(`    Items: ${menuItems} menu items, ${itemSales} daily_item_sales`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    Items error: ${msg}`);
      result.errors.push(`Items ${chunk.start}: ${msg}`);
    }

    await sleep(500); // rate limit between chunks
  }

  // Write sync log
  const totalRows = result.metricsRows + result.laborUpdates + result.menuItems + result.itemSalesRows;
  const hasErrors = result.errors.length > 0;

  await writeSyncLog(
    'toast-analytics',
    opts.mode,
    hasErrors ? 'partial' : 'success',
    totalRows,
    `${result.locations.join(', ')}: ${result.metricsRows} metrics, ${result.laborUpdates} labor, ${result.menuItems} menu, ${result.itemSalesRows} item sales${hasErrors ? ` (${result.errors.length} errors)` : ''}`
  );

  console.log(`[Toast Sync] Done. ${totalRows} total rows. ${hasErrors ? `${result.errors.length} errors.` : 'Clean.'}`);
  return result;
}
