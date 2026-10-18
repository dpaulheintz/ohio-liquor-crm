import { requireWholesaleAccess, loadCustomers } from '@/lib/wholesale-forms-server';
import { WholesalersClient } from './wholesalers-client';

export const dynamic = 'force-dynamic';

export default async function WholesalersPage() {
  const { supabase } = await requireWholesaleAccess();
  const customers = await loadCustomers(supabase, true);
  return <WholesalersClient customers={customers} />;
}
