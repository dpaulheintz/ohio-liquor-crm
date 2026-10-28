import { requireWholesaleAccess, loadCustomers, loadEmailRecipients, loadProducts, loadWarehouses } from '@/lib/wholesale-forms-server';
import { todayInNewYork } from '@/lib/date-utils';
import { FormEditor } from '../form-editor';

export const dynamic = 'force-dynamic';

export default async function NewWholesaleFormPage() {
  const { supabase, access } = await requireWholesaleAccess();
  const [products, customers, warehouses, recipients] = await Promise.all([
    loadProducts(supabase), loadCustomers(supabase), loadWarehouses(supabase), loadEmailRecipients(supabase),
  ]);
  const rows = products.map((p) => ({
    productId: p.id,
    brand_code: p.brand_code,
    description: p.description,
    unit_type: p.unit_type,
    price_cents: p.price_cents,
  }));
  return <FormEditor rows={rows} customers={customers} warehouses={warehouses} recipients={recipients} isAdmin={access.isAdmin} today={todayInNewYork()} />;
}
