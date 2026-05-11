import { getKpiDashboardData } from '@/app/actions/kpi';
import { KpiDashboardClient } from './kpi-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function KpiDashboardPage() {
  const data = await getKpiDashboardData();
  return <KpiDashboardClient {...data} />;
}
