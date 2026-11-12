import { requireBottleSalesAccess, loadFiscalStartMonth, loadLines, loadLocations, loadProducts } from '@/lib/bottle-sales-server';
import { todayInNewYork } from '@/lib/date-utils';
import { DashboardClient } from './dashboard-client';

export const dynamic = 'force-dynamic';

export default async function BottleSalesDashboardPage() {
  const sb = await requireBottleSalesAccess();
  const [lines, products, locations, fyStart] = await Promise.all([loadLines(sb), loadProducts(sb), loadLocations(sb), loadFiscalStartMonth(sb)]);
  // only what the dashboard needs
  const slim = lines.map((l) => ({ d: l.sale_date, loc: l.location_code, t: l.type, sku: l.sku, b: l.bottles, u: l.units_per_case, p: l.paid_c, w: l.wholesale_c, r: l.retail_c }));
  const prods = products.map((p) => ({ sku: p.sku, name: p.display_name, group: p.report_group, sort: p.sort_order }));
  return <DashboardClient lines={slim} products={prods} locations={locations} fyStart={fyStart} today={todayInNewYork()} />;
}
