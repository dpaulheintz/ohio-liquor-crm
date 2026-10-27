import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { LocationsClient } from './locations-client';

export const dynamic = 'force-dynamic';

export default async function PayrollLocationsPage() {
  const { supabase } = await requirePayroll();
  const { locations } = await loadConfig(supabase);
  return <LocationsClient locations={locations} />;
}
