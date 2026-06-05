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
  fetchLabor,
  fetchMenuItemSales,
  type MetricsRow,
  type LaborRow,
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

// ─── Labor → daily_sales labor columns ────────────────────────────────────────

async function syncLabor(
  locations: Location[],
  start: string,
  end: string
): Promise<number> {
  const supabase = createAdminClient();
  const restaurantIds = locations.map((l) => l.toast_guid);
  const guidToId = new Map(locations.map((l) => [l.toast_guid, l.id]));

  let rows: LaborRow[];
  try {
    rows = await fetchLabor(restaurantIds, start, end);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('403')) {
      console.warn('Labor API: 403 Forbidden — skipping (no labor scope)');
      return 0;
    }
    throw new Error(`Labor fetch failed: ${msg}`);
  }

  if (!Array.isArray(rows) || rows.length === 0) return 0;

  // Aggregate by (restaurant, date) since rows may be split by job
  const agg = new Map<string, { locationId: string; date: string; cost: number; hours: number }>();
  for (const row of rows) {
    const locationId = guidToId.get(row.restaurantGuid);
    if (!locationId) continue;
    const dateStr = toIsoDate(row.businessDate);
    const key = `${locationId}::${dateStr}`;
    const existing = agg.get(key) ?? { locationId, date: dateStr, cost: 0, hours: 0 };
    existing.cost += row.totalCost ?? 0;
    existing.hours += row.totalHours ?? 0;
    agg.set(key, existing);
  }

  let count = 0;
  for (const { locationId, date, cost, hours } of agg.values()) {
    const { error } = await supabase
      .from('daily_sales')
      .update({
        labor_cost: cost,
        labor_hours: hours,
        updated_at: new Date().toISOString(),
      })
      .eq('location_id', locationId)
      .eq('business_date', date);
    if (error) console.error(`Labor update error for ${date}:`, error.message);
    else count++;
  }

  return count;
}

// ─── Menu item sales → menu_items + daily_item_sales ──────────────────────────

async function syncMenuItems(
  locations: Location[],
  start: string,
  end: string
): Promise<{ menuItems: number; itemSales: number }> {
  const supabase = createAdminClient();
  const restaurantIds = locations.map((l) => l.toast_guid);
  const guidToId = new Map(locations.map((l) => [l.toast_guid, l.id]));

  let rows: MenuItemRow[];
  try {
    rows = await fetchMenuItemSales(restaurantIds, start, end);
  } catch (err) {
    throw new Error(`Menu item sales fetch failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!Array.isArray(rows) || rows.length === 0) return { menuItems: 0, itemSales: 0 };

  let menuItems = 0;
  let itemSales = 0;

  // Deduplicate menu items across dates — upsert each unique (location, itemGuid) once
  const seenItems = new Set<string>();

  for (const row of rows) {
    const locationId = guidToId.get(row.restaurantGuid);
    if (!locationId) continue;
    if (!row.menuItemGuid) continue;

    const itemKey = `${locationId}::${row.menuItemGuid}`;
    const dateStr = toIsoDate(row.businessDate);

    // Upsert menu_item if not already done this run
    if (!seenItems.has(itemKey)) {
      seenItems.add(itemKey);
      const { error: miErr } = await supabase
        .from('menu_items')
        .upsert(
          {
            location_id: locationId,
            toast_guid: row.menuItemGuid,
            name: row.menuItemName ?? 'Unknown',
            menu_group: row.menuGroupName ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'location_id,toast_guid' }
        );
      if (miErr) {
        console.error(`menu_item upsert error for ${row.menuItemGuid}:`, miErr.message);
      } else {
        menuItems++;
      }
    }

    // Look up menu_item id
    const { data: mi } = await supabase
      .from('menu_items')
      .select('id')
      .eq('location_id', locationId)
      .eq('toast_guid', row.menuItemGuid)
      .maybeSingle();

    if (!mi) continue;

    // Upsert daily_item_sales
    const { error: disErr } = await supabase
      .from('daily_item_sales')
      .upsert(
        {
          location_id: locationId,
          menu_item_id: mi.id,
          business_date: dateStr,
          quantity_sold: row.quantitySold ?? 0,
          gross_revenue: row.grossSalesAmount ?? 0,
        },
        { onConflict: 'location_id,menu_item_id,business_date' }
      );
    if (disErr) console.error(`daily_item_sales upsert error:`, disErr.message);
    else itemSales++;
  }

  return { menuItems, itemSales };
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

    // 2. Labor
    try {
      const n = await syncLabor(locations, chunk.start, chunk.end);
      result.laborUpdates += n;
      console.log(`    Labor: ${n} updates`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    Labor error: ${msg}`);
      result.errors.push(`Labor ${chunk.start}: ${msg}`);
    }

    // 3. Menu item sales
    try {
      const { menuItems, itemSales } = await syncMenuItems(locations, chunk.start, chunk.end);
      result.menuItems += menuItems;
      result.itemSalesRows += itemSales;
      console.log(`    Menu items: ${menuItems} upserted, ${itemSales} daily_item_sales`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`    Menu error: ${msg}`);
      result.errors.push(`Menu ${chunk.start}: ${msg}`);
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
