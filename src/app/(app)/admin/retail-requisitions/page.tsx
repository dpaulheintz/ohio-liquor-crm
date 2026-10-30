import { loadRequisitionHistory, requireRetailReqAccess } from '@/lib/retail-requisitions-server';
import { HistoryClient } from './history-client';

export const dynamic = 'force-dynamic';

export default async function RetailRequisitionHistoryPage() {
  const { supabase } = await requireRetailReqAccess();
  return <HistoryClient requisitions={await loadRequisitionHistory(supabase)} />;
}
