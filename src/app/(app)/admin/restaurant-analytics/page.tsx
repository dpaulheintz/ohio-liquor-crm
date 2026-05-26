import { RestaurantDashboardClient } from './dashboard-client';

export const metadata = { title: 'Restaurant Analytics | High Bank CRM' };

// Stub — will be replaced with real Supabase fetches once data pipeline is wired.
export default async function RestaurantAnalyticsPage() {
  // TODO: fetch locations, daily_sales, menu_items, sync_log
  const dataThrough: string | null = null;

  return <RestaurantDashboardClient dataThrough={dataThrough} />;
}
