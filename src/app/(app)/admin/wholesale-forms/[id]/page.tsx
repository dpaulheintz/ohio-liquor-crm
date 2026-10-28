import { notFound } from 'next/navigation';
import { requireWholesaleAccess, loadCustomers, loadEmailRecipients, loadForm, loadWarehouses } from '@/lib/wholesale-forms-server';
import { todayInNewYork } from '@/lib/date-utils';
import { FormEditor } from '../form-editor';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WholesaleFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, access } = await requireWholesaleAccess();
  const [form, customers, warehouses, recipients] = await Promise.all([
    loadForm(supabase, id), loadCustomers(supabase, true), loadWarehouses(supabase), loadEmailRecipients(supabase),
  ]);
  if (!form) notFound();

  // A saved form edits its own snapshotted lines (prices frozen at the time of sale).
  const rows = form.lines
    .filter((l) => l.product_id)
    .map((l) => ({
      productId: l.product_id!,
      brand_code: l.brand_code,
      description: l.description,
      unit_type: l.unit_type,
      price_cents: l.price_cents,
    }));

  return (
    <FormEditor
      key={form.updated_at}
      rows={rows}
      customers={customers.filter((c) => !c.archived || c.id === form.customer_id)}
      warehouses={warehouses}
      recipients={recipients}
      isAdmin={access.isAdmin}
      today={todayInNewYork()}
      initial={form}
    />
  );
}
