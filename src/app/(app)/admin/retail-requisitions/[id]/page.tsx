import { notFound } from 'next/navigation';
import { loadReqProducts, loadRequisition, requireRetailReqAccess } from '@/lib/retail-requisitions-server';
import { loadEmailRecipients } from '@/lib/wholesale-forms-server';
import { todayInNewYork } from '@/lib/date-utils';
import { RequisitionEditor } from '../requisition-editor';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, access } = await requireRetailReqAccess();
  const [requisition, products, recipients] = await Promise.all([
    loadRequisition(supabase, id), loadReqProducts(supabase), loadEmailRecipients(supabase),
  ]);
  if (!requisition) notFound();
  return (
    <RequisitionEditor
      key={requisition.updated_at}
      products={products}
      recipients={recipients}
      isAdmin={access.isAdmin}
      today={todayInNewYork()}
      initial={requisition}
    />
  );
}
