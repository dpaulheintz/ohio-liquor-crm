import { createAdminClient } from '@/lib/supabase/server';
import { RestaurantDashboardClient } from './dashboard-client';
import { LOCATIONS, type DailyRow, type LocationName } from './lib';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Restaurant Analytics | High Bank CRM' };

const PAGE_SIZE = 1000;

export default async function RestaurantAnalyticsPage() {
  const supabase = createAdminClient();

  // Map location_id → name (only the four restaurant locations we chart).
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name');

  const idToName = new Map<string, LocationName>();
  for (const l of locs ?? []) {
    if ((LOCATIONS as readonly string[]).includes(l.name)) {
      idToName.set(l.id as string, l.name as LocationName);
    }
  }

  // Fetch the full daily_sales history in pages (PostgREST caps a single
  // response, so range through until a short page comes back).
  const raw: Array<{
    business_date: string;
    location_id: string;
    fnb_revenue: number | null;
    total_revenue: number | null;
    guest_count: number | null;
    check_count: number | null;
  }> = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_sales')
      .select('business_date, location_id, fnb_revenue, total_revenue, guest_count, check_count')
      .order('business_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;
    raw.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  // Denormalize: attach location name, drop rows for unknown locations.
  const rows: DailyRow[] = [];
  for (const r of raw) {
    const location = idToName.get(r.location_id);
    if (!location) continue;
    rows.push({
      date: r.business_date,
      location,
      fnb: r.fnb_revenue ?? 0,
      total: r.total_revenue ?? 0,
      guests: r.guest_count ?? 0,
      checks: r.check_count ?? 0,
    });
  }

  const dataThrough = rows.length > 0
    ? rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date)
    : null;

  return <RestaurantDashboardClient rows={rows} dataThrough={dataThrough} />;
}
