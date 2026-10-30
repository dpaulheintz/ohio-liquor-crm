import { redirect } from 'next/navigation';
import { getRetailReqAccess, loadReqProducts } from '@/lib/retail-requisitions-server';
import { createClient } from '@/lib/supabase/server';
import { RETAIL_REQ_PATH } from '@/lib/retail-requisitions';
import { SkuListClient } from './sku-list-client';

export const dynamic = 'force-dynamic';

export default async function SkuListPage() {
  const supabase = await createClient();
  const access = await getRetailReqAccess(supabase);
  if (!access.isAdmin) redirect(RETAIL_REQ_PATH);
  return <SkuListClient products={await loadReqProducts(supabase, true)} />;
}
