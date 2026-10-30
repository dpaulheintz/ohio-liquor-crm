import { loadReqProducts, requireRetailReqAccess } from '@/lib/retail-requisitions-server';
import { loadEmailRecipients } from '@/lib/wholesale-forms-server';
import { todayInNewYork } from '@/lib/date-utils';
import { RequisitionEditor } from '../requisition-editor';

export const dynamic = 'force-dynamic';

export default async function NewRequisitionPage() {
  const { supabase, access } = await requireRetailReqAccess();
  const [products, recipients] = await Promise.all([loadReqProducts(supabase), loadEmailRecipients(supabase)]);
  return <RequisitionEditor products={products} recipients={recipients} isAdmin={access.isAdmin} today={todayInNewYork()} />;
}
