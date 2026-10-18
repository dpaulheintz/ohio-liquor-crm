import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWholesaleAccess, loadProducts } from '@/lib/wholesale-forms-server';
import { WHOLESALE_FORMS_PATH } from '@/lib/wholesale-forms';
import { PriceListClient } from './price-list-client';

export const dynamic = 'force-dynamic';

export default async function PriceListPage() {
  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.isAdmin) redirect(WHOLESALE_FORMS_PATH);
  const products = await loadProducts(supabase, true);
  return <PriceListClient products={products} />;
}
