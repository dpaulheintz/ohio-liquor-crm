import { redirect } from 'next/navigation';
import { getSecretShopperAccess, getSecretShopperVisits } from '@/app/actions/secret-shopper';
import type { SecretShopperVisitRow } from '@/lib/secret-shopper';
import { SecretShopperDashboardClient } from './secret-shopper-dashboard-client';

export const metadata = { title: 'Secret Shopper | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function SecretShopperDashboardPage() {
  const access = await getSecretShopperAccess();
  if (access === 'none') redirect('/');

  let visits: SecretShopperVisitRow[] = [];
  let loadError: string | null = null;
  if (access === 'admin') {
    try {
      visits = await getSecretShopperVisits();
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Failed to load visits';
    }
  }

  return <SecretShopperDashboardClient visits={visits} demo={access === 'demo'} loadError={loadError} />;
}
