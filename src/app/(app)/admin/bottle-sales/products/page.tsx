import { requireBottleSalesAccess, loadProducts } from '@/lib/bottle-sales-server';
import { ProductsClient } from './products-client';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const sb = await requireBottleSalesAccess();
  return <ProductsClient products={await loadProducts(sb)} />;
}
