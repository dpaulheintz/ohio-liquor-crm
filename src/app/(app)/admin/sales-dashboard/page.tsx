import { getSalesDashboardData } from '@/app/actions/sales-dashboard';
import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function SalesDashboardPage() {
  const data = await getSalesDashboardData();
  return <DashboardClient data={data} />;
}
