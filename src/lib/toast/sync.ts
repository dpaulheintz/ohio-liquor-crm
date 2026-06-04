/**
 * Toast → Supabase Sync
 *
 * Two modes:
 *   1. backfill  — Jan 1 2024 → today, chunked by day
 *   2. daily     — yesterday only (intended for cron/scheduled runs)
 *
 * Pipeline per location:
 *   a) Fetch menus → upsert menu_items
 *   b) Fetch orders for date range → aggregate into daily_sales + daily_item_sales
 *   c) Fetch labor time entries → update labor columns on daily_sales
 *   d) Write sync_log entry
 *
 * Environment variables (set in Vercel or .env.local):
 *   TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_API_URL (optional),
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createAdminClient } from '@/lib/supabase/server';
import {
  fetchOrders,
  fetchTimeEntries,
  fetchMenus,
  flattenMenuItems,
  type ToastOrder,
  type ToastTimeEntry,
} from './client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert yyyymmdd integer to YYYY-MM-DD string */
function bizDateToStr(bd: number): string {
  const s = String(bd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Generate array of YYYY-MM-DD date strings from start to end (inclusive) */
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

/** Chunk an array into sub-arrays of max size `n` */
function chunk<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    chunks.push(arr.slice(i, i + n));
  }
  return chunks;
}

/** Delay helper for rate limiting */
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

// ─── Menu sync ────────────────────────────────────────────────────────────────

async function syncMenus(location: Location): Promise<number> {
  const supabase = createAdminClient();
  const raw = await fetchMenus(location.toast_guid);
  const flat = flattenMenuItems(raw);

  if (flat.length === 0) {
    console.warn(`[${location.name}] Menus: 0 items extracted. Raw shape: ${JSON.stringify(raw).slice(0, 300)}`);
    return 0;
  }

  // Deduplicate by toast_guid (same item can appear in multiple menus)
  const deduped = new Map<string, typeof flat[0]>();
  for (const item of flat) deduped.set(item.guid, item);

  const rows = [...deduped.values()].map((item) => ({
    location_id: location.id,
    toast_guid: item.guid,
    name: item.name,
    category: item.menuName,
    menu_group: item.groupName,
    current_price: item.price,
    updated_at: new Date().toISOString(),
  }));

  let count = 0;
  for (const batch of chunk(rows, 200)) {
    const { error } = await supabase
      .from('menu_items')
      .upsert(batch, { onConflict: 'location_id,toast_guid', ignoreDuplicates: false });
    if (error) {
      console.error(`[${location.name}] Menu upsert error (batch of ${batch.length}): ${error.message}`);
      // Fall back to one-by-one inserts
      for (const row of batch) {
        const { error: singleErr } = await supabase
          .from('menu_items')
          .upsert(row, { onConflict: 'location_id,toast_guid' });
        if (!singleErr) count++;
      }
      continue;
    }
    count += batch.length;
  }

  return count;
}

// ─── Orders → daily_sales + daily_item_sales ──────────────────────────────────

interface DailySalesAgg {
  fnb_revenue: number;
  retail_revenue: number;
  total_revenue: number;
  guest_count: number;
  check_count: number;
}

interface DailyItemAgg {
  menu_item_toast_guid: string;
  display_name: string;
  quantity_sold: number;
  gross_revenue: number;
}

function aggregateOrders(orders: ToastOrder[]): {
  byDate: Map<string, DailySalesAgg>;
  itemsByDate: Map<string, Map<string, DailyItemAgg>>;
} {
  const byDate = new Map<string, DailySalesAgg>();
  const itemsByDate = new Map<string, Map<string, DailyItemAgg>>();

  for (const order of orders) {
    // Skip voided/deleted orders
    if (order.voided || order.deleted) continue;

    const dateStr = bizDateToStr(order.businessDate);

    // Initialize date bucket
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, {
        fnb_revenue: 0,
        retail_revenue: 0,
        total_revenue: 0,
        guest_count: 0,
        check_count: 0,
      });
    }
    if (!itemsByDate.has(dateStr)) {
      itemsByDate.set(dateStr, new Map());
    }

    const day = byDate.get(dateStr)!;
    const dayItems = itemsByDate.get(dateStr)!;

    day.guest_count += order.numberOfGuests ?? 0;

    for (const check of order.checks ?? []) {
      if (check.voided || check.deleted) continue;
      day.check_count += 1;
      day.total_revenue += check.totalAmount ?? 0;
      // F&B revenue = subtotal (before tax); retail tracked separately if tagged
      day.fnb_revenue += check.amount ?? 0;

      // Item-level aggregation
      for (const sel of check.selections ?? []) {
        if (sel.voided || sel.deselected) continue;
        const itemGuid = sel.itemGuid;
        if (!itemGuid) continue;

        const existing = dayItems.get(itemGuid) ?? {
          menu_item_toast_guid: itemGuid,
          display_name: sel.displayName ?? 'Unknown',
          quantity_sold: 0,
          gross_revenue: 0,
        };
        existing.quantity_sold += sel.quantity ?? 1;
        existing.gross_revenue += sel.price ?? 0;
        dayItems.set(itemGuid, existing);
      }
    }
  }

  return { byDate, itemsByDate };
}

async function syncOrders(
  location: Location,
  dates: string[]
): Promise<{ salesRows: number; itemRows: number }> {
  const supabase = createAdminClient();
  let salesRows = 0;
  let itemRows = 0;

  // Process in day-sized chunks to keep API calls manageable
  // Toast orders endpoint uses modification timestamps, so we query day by day
  for (const dateStr of dates) {
    const startDate = `${dateStr}T00:00:00.000+0000`;
    const endDate = `${dateStr}T23:59:59.999+0000`;

    let orders: ToastOrder[];
    try {
      orders = await fetchOrders(location.toast_guid, startDate, endDate);
    } catch (err) {
      console.error(`[${location.name}] Orders fetch failed for ${dateStr}:`, err);
      continue;
    }

    if (orders.length === 0) continue;

    const { byDate, itemsByDate } = aggregateOrders(orders);

    // Upsert daily_sales
    for (const [bizDate, agg] of byDate.entries()) {
      const { error } = await supabase
        .from('daily_sales')
        .upsert(
          {
            location_id: location.id,
            business_date: bizDate,
            fnb_revenue: agg.fnb_revenue,
            retail_revenue: agg.retail_revenue,
            total_revenue: agg.total_revenue,
            guest_count: agg.guest_count,
            check_count: agg.check_count,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'location_id,business_date' }
        );
      if (error) console.error(`[${location.name}] daily_sales upsert error for ${bizDate}:`, error.message);
      else salesRows++;
    }

    // Upsert daily_item_sales — need to resolve menu_item_id from toast_guid
    for (const [bizDate, items] of itemsByDate.entries()) {
      for (const [toastGuid, agg] of items.entries()) {
        // Look up the menu_item id by toast_guid + location
        const { data: menuItem } = await supabase
          .from('menu_items')
          .select('id')
          .eq('location_id', location.id)
          .eq('toast_guid', toastGuid)
          .maybeSingle();

        if (!menuItem) continue; // skip items not in our menu_items table

        const { error } = await supabase
          .from('daily_item_sales')
          .upsert(
            {
              location_id: location.id,
              menu_item_id: menuItem.id,
              business_date: bizDate,
              quantity_sold: agg.quantity_sold,
              gross_revenue: agg.gross_revenue,
            },
            { onConflict: 'location_id,menu_item_id,business_date' }
          );
        if (error) console.error(`[${location.name}] daily_item_sales upsert error:`, error.message);
        else itemRows++;
      }
    }

    // Brief pause between days to respect rate limits
    await sleep(200);
  }

  return { salesRows, itemRows };
}

// ─── Labor → daily_sales labor columns ────────────────────────────────────────

async function syncLabor(
  location: Location,
  dates: string[]
): Promise<number> {
  const supabase = createAdminClient();
  let updated = 0;

  // Toast labor API has a max 1-month range, so chunk dates into 28-day windows
  const windows = chunk(dates, 28);

  for (const window of windows) {
    const startDate = `${window[0]}T00:00:00.000+0000`;
    const endDate = `${window[window.length - 1]}T23:59:59.999+0000`;

    let entries: ToastTimeEntry[];
    try {
      entries = await fetchTimeEntries(location.toast_guid, startDate, endDate);
    } catch (err) {
      console.error(`[${location.name}] Labor fetch failed for ${window[0]}–${window[window.length - 1]}:`, err);
      continue;
    }

    if (!Array.isArray(entries) || entries.length === 0) continue;

    // Aggregate by business date (derived from inDate)
    const laborByDate = new Map<string, { cost: number; hours: number }>();

    for (const entry of entries) {
      if (!entry.inDate) continue;
      const dateStr = entry.inDate.slice(0, 10); // YYYY-MM-DD from ISO

      const existing = laborByDate.get(dateStr) ?? { cost: 0, hours: 0 };
      const totalHours = (entry.regularHours ?? 0) + (entry.overtimeHours ?? 0);
      const wage = entry.hourlyWage ?? 0;
      // Overtime at 1.5x
      const cost = ((entry.regularHours ?? 0) * wage) + ((entry.overtimeHours ?? 0) * wage * 1.5);

      existing.hours += totalHours;
      existing.cost += cost;
      laborByDate.set(dateStr, existing);
    }

    // Update daily_sales rows with labor data
    for (const [dateStr, labor] of laborByDate.entries()) {
      const { error } = await supabase
        .from('daily_sales')
        .update({
          labor_cost: labor.cost,
          labor_hours: labor.hours,
          updated_at: new Date().toISOString(),
        })
        .eq('location_id', location.id)
        .eq('business_date', dateStr);

      if (error) console.error(`[${location.name}] Labor update error for ${dateStr}:`, error.message);
      else updated++;
    }

    await sleep(200);
  }

  return updated;
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
  location: string;
  menuItems: number;
  salesRows: number;
  itemSalesRows: number;
  laborUpdates: number;
  errors: string[];
}

export interface SyncOptions {
  mode: 'daily' | 'backfill';
  /** Filter to a single location name (e.g. "Grandview") */
  locationFilter?: string;
  /** Override start date (YYYY-MM-DD). Only used when mode=backfill. */
  startDate?: string;
  /** Override end date (YYYY-MM-DD). Only used when mode=backfill. */
  endDate?: string;
}

export async function runSync(opts: SyncOptions): Promise<SyncResult[]> {
  let locations = await getActiveLocations();
  const results: SyncResult[] = [];

  // Optional location filter
  if (opts.locationFilter) {
    locations = locations.filter(
      (l) => l.name.toLowerCase() === opts.locationFilter!.toLowerCase()
    );
    if (locations.length === 0) {
      throw new Error(`No active location found matching "${opts.locationFilter}"`);
    }
  }

  // Determine date range
  let dates: string[];
  if (opts.mode === 'backfill') {
    const start = opts.startDate ?? '2024-01-01';
    const end = opts.endDate ?? new Date().toISOString().slice(0, 10);
    dates = dateRange(start, end);
  } else {
    // Daily mode: yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = yesterday.toISOString().slice(0, 10);
    dates = [yd];
  }

  console.log(`[Toast Sync] Mode: ${opts.mode}, dates: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days), ${locations.length} locations`);

  for (const location of locations) {
    console.log(`\n[${location.name}] Starting sync...`);
    const result: SyncResult = {
      location: location.name,
      menuItems: 0,
      salesRows: 0,
      itemSalesRows: 0,
      laborUpdates: 0,
      errors: [],
    };

    // 1. Sync menus first (so menu_item IDs exist for item sales)
    try {
      result.menuItems = await syncMenus(location);
      console.log(`  [${location.name}] Menus: ${result.menuItems} items upserted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${location.name}] Menu sync error: ${msg}`);
      result.errors.push(`Menu: ${msg}`);
    }

    // 2. Sync orders → daily_sales + daily_item_sales
    try {
      const { salesRows, itemRows } = await syncOrders(location, dates);
      result.salesRows = salesRows;
      result.itemSalesRows = itemRows;
      console.log(`  [${location.name}] Orders: ${salesRows} daily_sales, ${itemRows} daily_item_sales`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${location.name}] Orders sync error: ${msg}`);
      result.errors.push(`Orders: ${msg}`);
    }

    // 3. Sync labor → update daily_sales labor columns
    try {
      result.laborUpdates = await syncLabor(location, dates);
      console.log(`  [${location.name}] Labor: ${result.laborUpdates} days updated`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${location.name}] Labor sync error: ${msg}`);
      result.errors.push(`Labor: ${msg}`);
    }

    results.push(result);
  }

  // Write sync log
  const totalRows = results.reduce((s, r) => s + r.salesRows + r.itemSalesRows + r.menuItems + r.laborUpdates, 0);
  const hasErrors = results.some((r) => r.errors.length > 0);
  const summary = results
    .map((r) => `${r.location}: ${r.menuItems} menu, ${r.salesRows} sales, ${r.itemSalesRows} items, ${r.laborUpdates} labor${r.errors.length > 0 ? ` (${r.errors.length} errors)` : ''}`)
    .join('; ');

  await writeSyncLog(
    'toast',
    opts.mode,
    hasErrors ? 'partial' : 'success',
    totalRows,
    summary
  );

  console.log(`\n[Toast Sync] Complete. Total rows: ${totalRows}. ${hasErrors ? 'Some errors occurred.' : 'All clean.'}`);
  return results;
}
