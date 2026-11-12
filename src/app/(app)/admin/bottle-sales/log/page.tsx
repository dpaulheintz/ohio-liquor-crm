import { requireBottleSalesAccess, loadLines, loadLocations, loadProducts } from '@/lib/bottle-sales-server';
import { todayInNewYork } from '@/lib/date-utils';
import { EntryForm } from '../entry-form';
import { buildFormData } from '../form-data';

export const dynamic = 'force-dynamic';

export default async function LogSalesPage() {
  const sb = await requireBottleSalesAccess();
  const [products, locations, lines] = await Promise.all([loadProducts(sb), loadLocations(sb), loadLines(sb)]);
  return <EntryForm mode="new" today={todayInNewYork()} {...buildFormData(products, locations, lines)} />;
}
