import { requireWholesaleAccess, loadCustomers, loadFormHistory } from '@/lib/wholesale-forms-server';
import { HistoryClient } from './history-client';

export const dynamic = 'force-dynamic';

export default async function WholesaleFormHistoryPage() {
  const { supabase } = await requireWholesaleAccess();
  const [forms, customers] = await Promise.all([loadFormHistory(supabase), loadCustomers(supabase, true)]);
  return <HistoryClient forms={forms} customers={customers.map((c) => ({ id: c.id, name: c.name }))} />;
}
