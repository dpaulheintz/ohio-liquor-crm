import { requireBottleSalesAccess, loadFiscalStartMonth, loadLines, loadLocations, loadProducts } from '@/lib/bottle-sales-server';
import { EntriesClient, type EntrySummary } from './entries-client';

export const dynamic = 'force-dynamic';

export default async function EntriesPage() {
  const sb = await requireBottleSalesAccess();
  const [lines, products, locations, fyStart] = await Promise.all([loadLines(sb), loadProducts(sb), loadLocations(sb), loadFiscalStartMonth(sb)]);
  const names = new Map(products.map((p) => [p.sku, p.display_name]));
  const byEntry = new Map<string, EntrySummary>();
  for (const l of lines) {
    let e = byEntry.get(l.entry_id);
    if (!e) {
      e = { entry_id: l.entry_id, sale_date: l.sale_date, location_code: l.location_code, type: l.type, bottles: 0, paid_c: 0, wholesale_c: 0, skus: [], search: '', source: l.source, notes: l.notes };
      byEntry.set(l.entry_id, e);
    }
    e.bottles += l.bottles; e.paid_c += l.paid_c; e.wholesale_c += l.wholesale_c;
    if (!e.skus.includes(l.sku)) e.skus.push(l.sku);
  }
  const entries = [...byEntry.values()]
    .map((e) => ({ ...e, search: `${e.skus.join(' ')} ${e.skus.map((s) => names.get(s) ?? '').join(' ')} ${e.notes ?? ''}`.toLowerCase() }))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  return <EntriesClient entries={entries} locations={locations} fyStart={fyStart} />;
}
