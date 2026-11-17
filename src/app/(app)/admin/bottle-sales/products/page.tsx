import { requireBottleSalesAccess, canEditLocations, loadLocations, loadProducts } from '@/lib/bottle-sales-server';
import { LocationsCard } from './locations-card';
import { ProductsClient } from './products-client';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const sb = await requireBottleSalesAccess();
  const [products, locations, canEdit] = await Promise.all([loadProducts(sb), loadLocations(sb), canEditLocations(sb)]);
  return (
    <div className="space-y-6">
      <LocationsCard key={locations.map((l) => `${l.code}${l.agency_number}${l.gl_account}`).join('|')} locations={locations} canEdit={canEdit} />
      <ProductsClient products={products} />
    </div>
  );
}
