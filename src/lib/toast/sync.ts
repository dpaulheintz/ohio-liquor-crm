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
  toastGetStandard,
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
  // Retry with backoff on 429 rate limit
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      rows = await fetchMetrics(restaurantIds, start, end);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') && attempt < 2) {
        const waitSec = (attempt + 1) * 10;
        // 429 rate limited — waiting before retry
        await sleep(waitSec * 1000);
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
          // Labor from metrics (aggregated — may be overwritten by labor report)
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
        orders = await toastGetStandard('/orders/v2/ordersBulk', location.toast_guid, { businessDate: bizDate });
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

      menuItemCount += menuRows.length;

      // Upsert daily_item_sales — individual lookups + upserts
      for (const [guid, agg] of dayItems) {
        const { data: mi } = await supabase
          .from('menu_items')
          .select('id')
          .eq('location_id', location.id)
          .eq('toast_guid', guid)
          .maybeSingle();
        if (!mi) continue;

        const { error } = await supabase
          .from('daily_item_sales')
          .upsert(
            {
              location_id: location.id,
              menu_item_id: mi.id,
              business_date: dateStr,
              quantity_sold: agg.qty,
              gross_revenue: agg.rev,
            },
            { onConflict: 'location_id,menu_item_id,business_date' }
          );
        if (error) { /* upsert error — row skipped */ }
        else itemSalesCount++;
      }

      // Rate limit — 2s between days to avoid 429
      await sleep(2000);
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

  // Chunk size depends on step:
  // - metrics: Analytics API handles multi-day natively, 7-day chunks fine
  // - items: orders API is per-day + DB writes, keep chunks small (3 days)
  const chunkSize = step === 'items' ? 3 : 7;
  const chunks = chunkDateRange(start, end, chunkSize);

  for (const chunk of chunks) {
    // 1. Metrics + labor (Analytics API — one call gets both)
    if (step === 'all' || step === 'metrics') {
      try {
        result.metricsRows += await syncMetrics(locations, chunk.start, chunk.end);
      } catch (err) {
        result.errors.push(`Metrics ${chunk.start}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Item sales (Standard API /orders/v2/ordersBulk — separate credentials)
    if (step === 'all' || step === 'items') {
      try {
        const { menuItems, itemSales } = await syncItemSales(locations, chunk.start, chunk.end);
        result.menuItems += menuItems;
        result.itemSalesRows += itemSales;
      } catch (err) {
        result.errors.push(`Items ${chunk.start}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await sleep(3000); // 3s between chunks to avoid rate limits
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

  return result;
}
