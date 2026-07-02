import { createAdminClient } from '@/lib/supabase/server';
import { RestaurantDashboardClient } from './dashboard-client';
import type { Section01Data, MonthlyRevenuePoint } from './section-01-revenue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Restaurant Analytics | High Bank CRM' };

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default async function RestaurantAnalyticsPage() {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;

  // Fetch two years of daily_sales for all aggregations in one query
  const { data: rows } = await supabase
    .from('daily_sales')
    .select('business_date, fnb_revenue, labor_cost, guest_count, check_count')
    .gte('business_date', `${priorYear}-01-01`)
    .lte('business_date', today)
    .limit(5000);

  const allRows = rows ?? [];

  // dataThrough = most recent date in the result set
  const dataThrough = allRows.length > 0
    ? allRows.reduce((max, r) => r.business_date > max ? r.business_date : max, allRows[0].business_date)
    : null;

  // Derived date strings for YTD comparisons
  const ytdStart     = `${currentYear}-01-01`;
  const priorYtdEnd  = `${priorYear}-${today.slice(5)}`; // same calendar day last year

  // Partition rows
  const ytdRows      = allRows.filter(r => r.business_date >= ytdStart);
  const priorYtdRows = allRows.filter(r => r.business_date >= `${priorYear}-01-01` && r.business_date <= priorYtdEnd);

  // YTD aggregates
  const ytdFnbRevenue      = ytdRows.reduce((s, r) => s + (r.fnb_revenue ?? 0), 0);
  const ytdLaborCost       = ytdRows.reduce((s, r) => s + (r.labor_cost ?? 0), 0);
  const ytdGuestCount      = ytdRows.reduce((s, r) => s + (r.guest_count ?? 0), 0);
  const ytdCheckCount      = ytdRows.reduce((s, r) => s + (r.check_count ?? 0), 0);
  const priorYtdFnbRevenue = priorYtdRows.reduce((s, r) => s + (r.fnb_revenue ?? 0), 0);

  const laborPct = ytdFnbRevenue > 0 && ytdLaborCost > 0
    ? (ytdLaborCost / ytdFnbRevenue) * 100
    : null;
  const avgCheck = ytdCheckCount > 0 ? ytdFnbRevenue / ytdCheckCount : 0;

  // Monthly totals by year for YoY chart
  const monthlyMap: Record<string, number> = {};
  for (const row of allRows) {
    const d = new Date(row.business_date + 'T00:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}`; // getMonth() is 0-indexed
    monthlyMap[key] = (monthlyMap[key] ?? 0) + (row.fnb_revenue ?? 0);
  }

  const monthlyRevenue: MonthlyRevenuePoint[] = MONTH_LABELS.map((month, i) => ({
    month,
    cur:   monthlyMap[`${currentYear}-${i}`] ?? null,
    prior: monthlyMap[`${priorYear}-${i}`]   ?? null,
  }));

  const section01Data: Section01Data = {
    ytdFnbRevenue,
    priorYtdFnbRevenue,
    laborPct,
    guestCount: ytdGuestCount,
    avgCheck,
    dataThrough,
    monthlyRevenue,
  };

  return <RestaurantDashboardClient section01Data={section01Data} />;
}
