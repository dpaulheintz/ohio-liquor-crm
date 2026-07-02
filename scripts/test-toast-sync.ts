/**
 * Test script: sync ONE location (Grandview) for ONE week (Jan 1–7 2024)
 * Run with: npx tsx scripts/test-toast-sync.ts
 *
 * Loads env from .env.local automatically via dotenv.
 */

import 'dotenv/config';

// Patch for path aliases — resolve @/ to src/
import { register } from 'module';
import { pathToFileURL } from 'url';

// We'll use direct relative imports instead of aliases
const BASE = process.cwd();

async function main() {
  // Dynamic imports to ensure env is loaded first
  const { getToastToken, fetchOrders, fetchTimeEntries, fetchMenus } = await import(BASE + '/src/lib/toast/client.ts');
  const { createAdminClient } = await import(BASE + '/src/lib/supabase/server.ts');

  const GRANDVIEW_TOAST_GUID = 'b5d9fdc1-ae0c-43d1-b7b8-ef097ff7b546';
  const GRANDVIEW_SUPABASE_ID = '99f798c2-5769-4b5f-a67e-21def1f3cec7';

  console.log('=== Toast Sync Test: Grandview, Jan 1–7 2024 ===\n');

  // Step 1: Test auth
  console.log('1. Authenticating with Toast...');
  try {
    const token = await getToastToken();
    console.log(`   ✓ Got token: ${token.slice(0, 20)}...${token.slice(-10)}`);
    console.log(`   Token length: ${token.length} chars\n`);
  } catch (err: any) {
    console.error(`   ✗ Auth failed: ${err.message}`);
    console.error('   Check TOAST_CLIENT_ID and TOAST_CLIENT_SECRET in .env.local');
    process.exit(1);
  }

  // Step 2: Fetch menus
  console.log('2. Fetching Grandview menus...');
  try {
    const menus = await fetchMenus(GRANDVIEW_TOAST_GUID);
    let totalItems = 0;
    for (const menu of menus) {
      let menuItemCount = 0;
      for (const group of menu.groups ?? []) {
        menuItemCount += (group.items ?? []).length;
      }
      console.log(`   Menu: "${menu.name}" — ${(menu.groups ?? []).length} groups, ${menuItemCount} items`);
      totalItems += menuItemCount;
    }
    console.log(`   ✓ Total: ${menus.length} menus, ${totalItems} items\n`);

    // Upsert menus to Supabase
    console.log('   Upserting menu items to Supabase...');
    const supabase = createAdminClient();
    const items: any[] = [];
    for (const menu of menus) {
      for (const group of menu.groups ?? []) {
        for (const item of group.items ?? []) {
          items.push({
            location_id: GRANDVIEW_SUPABASE_ID,
            toast_guid: item.guid,
            name: item.name,
            category: menu.name,
            menu_group: group.name,
            current_price: item.price,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 500) {
        const batch = items.slice(i, i + 500);
        const { error } = await supabase
          .from('menu_items')
          .upsert(batch, { onConflict: 'location_id,toast_guid' });
        if (error) console.error(`   ✗ Menu upsert error: ${error.message}`);
      }
      console.log(`   ✓ Upserted ${items.length} menu items\n`);
    }
  } catch (err: any) {
    console.error(`   ✗ Menus failed: ${err.message}\n`);
  }

  // Step 3: Fetch orders for Jan 1–7
  console.log('3. Fetching Grandview orders (Jan 1–7, 2024)...');
  const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];
  const supabase = createAdminClient();

  for (const dateStr of dates) {
    const startDate = `${dateStr}T00:00:00.000+0000`;
    const endDate = `${dateStr}T23:59:59.999+0000`;

    try {
      const orders = await fetchOrders(GRANDVIEW_TOAST_GUID, startDate, endDate);
      if (orders.length === 0) {
        console.log(`   ${dateStr}: 0 orders (maybe closed?)`);
        continue;
      }

      // Aggregate
      let revenue = 0, guests = 0, checks = 0;
      const itemMap = new Map<string, { name: string; qty: number; rev: number }>();

      for (const order of orders) {
        if (order.voided || order.deleted) continue;
        guests += order.numberOfGuests ?? 0;
        for (const check of order.checks ?? []) {
          if (check.voided || check.deleted) continue;
          checks++;
          revenue += check.totalAmount ?? 0;
          for (const sel of check.selections ?? []) {
            if (sel.voided || sel.deselected) continue;
            if (!sel.itemGuid) continue;
            const e = itemMap.get(sel.itemGuid) ?? { name: sel.displayName, qty: 0, rev: 0 };
            e.qty += sel.quantity ?? 1;
            e.rev += sel.price ?? 0;
            itemMap.set(sel.itemGuid, e);
          }
        }
      }

      console.log(`   ${dateStr}: ${orders.length} orders, ${checks} checks, ${guests} guests, $${revenue.toFixed(2)} revenue, ${itemMap.size} unique items`);

      // Upsert daily_sales
      const { error: salesErr } = await supabase
        .from('daily_sales')
        .upsert({
          location_id: GRANDVIEW_SUPABASE_ID,
          business_date: dateStr,
          fnb_revenue: revenue,
          total_revenue: revenue,
          guest_count: guests,
          check_count: checks,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'location_id,business_date' });

      if (salesErr) console.error(`   ✗ daily_sales upsert: ${salesErr.message}`);

      // Upsert daily_item_sales
      let itemRows = 0;
      for (const [toastGuid, agg] of itemMap) {
        const { data: menuItem } = await supabase
          .from('menu_items')
          .select('id')
          .eq('location_id', GRANDVIEW_SUPABASE_ID)
          .eq('toast_guid', toastGuid)
          .maybeSingle();
        if (!menuItem) continue;

        const { error } = await supabase
          .from('daily_item_sales')
          .upsert({
            location_id: GRANDVIEW_SUPABASE_ID,
            menu_item_id: menuItem.id,
            business_date: dateStr,
            quantity_sold: agg.qty,
            gross_revenue: agg.rev,
          }, { onConflict: 'location_id,menu_item_id,business_date' });
        if (!error) itemRows++;
      }
      console.log(`     → Saved: 1 daily_sales + ${itemRows} daily_item_sales rows`);
    } catch (err: any) {
      console.error(`   ✗ ${dateStr}: ${err.message}`);
    }

    // Brief pause
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 4: Fetch labor
  console.log('\n4. Fetching Grandview labor (Jan 1–7, 2024)...');
  try {
    const entries = await fetchTimeEntries(
      GRANDVIEW_TOAST_GUID,
      '2024-01-01T00:00:00.000+0000',
      '2024-01-07T23:59:59.999+0000'
    );

    if (!Array.isArray(entries) || entries.length === 0) {
      console.log('   No time entries returned');
    } else {
      console.log(`   ✓ ${entries.length} time entries`);

      // Aggregate by date
      const laborByDate = new Map<string, { cost: number; hours: number }>();
      for (const e of entries) {
        if (!e.inDate) continue;
        const d = e.inDate.slice(0, 10);
        const ex = laborByDate.get(d) ?? { cost: 0, hours: 0 };
        const totalH = (e.regularHours ?? 0) + (e.overtimeHours ?? 0);
        const wage = e.hourlyWage ?? 0;
        ex.hours += totalH;
        ex.cost += (e.regularHours ?? 0) * wage + (e.overtimeHours ?? 0) * wage * 1.5;
        laborByDate.set(d, ex);
      }

      for (const [d, l] of laborByDate) {
        console.log(`   ${d}: ${l.hours.toFixed(1)} hrs, $${l.cost.toFixed(2)} labor cost`);
        await supabase
          .from('daily_sales')
          .update({ labor_cost: l.cost, labor_hours: l.hours, updated_at: new Date().toISOString() })
          .eq('location_id', GRANDVIEW_SUPABASE_ID)
          .eq('business_date', d);
      }
      console.log(`   ✓ Updated ${laborByDate.size} daily_sales with labor data`);
    }
  } catch (err: any) {
    console.error(`   ✗ Labor failed: ${err.message}`);
  }

  // Step 5: Write sync_log
  await supabase.from('sync_log').insert({
    source: 'toast',
    sync_type: 'test',
    status: 'success',
    rows_affected: 0,
    message: 'Test run: Grandview Jan 1-7 2024',
  });

  console.log('\n5. Sync log written. Done!\n');

  // Verify data landed
  console.log('=== Verification ===');
  const { data: salesCheck } = await supabase
    .from('daily_sales')
    .select('business_date, fnb_revenue, total_revenue, guest_count, check_count, labor_cost, labor_hours')
    .eq('location_id', GRANDVIEW_SUPABASE_ID)
    .gte('business_date', '2024-01-01')
    .lte('business_date', '2024-01-07')
    .order('business_date');

  console.log('\ndaily_sales (Grandview, Jan 1-7 2024):');
  console.table(salesCheck);

  const { count: itemCount } = await supabase
    .from('daily_item_sales')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', GRANDVIEW_SUPABASE_ID)
    .gte('business_date', '2024-01-01')
    .lte('business_date', '2024-01-07');

  console.log(`\ndaily_item_sales rows: ${itemCount}`);

  const { count: menuCount } = await supabase
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('location_id', GRANDVIEW_SUPABASE_ID);

  console.log(`menu_items (Grandview): ${menuCount}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
