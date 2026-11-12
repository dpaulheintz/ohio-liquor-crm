import { notFound } from 'next/navigation';
import { requireBottleSalesAccess, loadAudit, loadLines, loadLocations, loadProducts } from '@/lib/bottle-sales-server';
import { fmtUsd, toCents } from '@/lib/bottle-sales';
import { todayInNewYork } from '@/lib/date-utils';
import { EntryForm } from '../../entry-form';
import { buildFormData } from '../../form-data';

export const dynamic = 'force-dynamic';

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await requireBottleSalesAccess();
  const [products, locations, all, audit] = await Promise.all([loadProducts(sb), loadLocations(sb), loadLines(sb), loadAudit(sb, id)]);
  const lines = all.filter((l) => l.entry_id === id);
  if (!lines.length) notFound();
  const h = lines[0];

  return (
    <div className="space-y-8">
      <EntryForm
        mode="edit"
        today={todayInNewYork()}
        {...buildFormData(products, locations, all)}
        edit={{
          entryId: id, date: h.sale_date, location: h.location_code, type: h.type, notes: h.notes ?? '',
          lines: lines.map((l) => ({
            id: l.id, sku: l.sku, bottles: l.bottles, paid_per_bottle: l.paid_per_bottle,
            wholesale_c_per: Math.round(l.wholesale_c / l.bottles), retail_c_per: Math.round(l.retail_c / l.bottles),
          })),
        }}
      />
      <section className="mx-auto max-w-2xl space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Change history {h.source === 'legacy_fy2026' ? '· imported from the FY2026 spreadsheet' : ''}
        </h3>
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes since it was logged.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {audit.map((a) => {
              const o = a.old_values as { sku?: string; bottles?: number; sale_date?: string; location_code?: string; type?: string; paid_amount?: number };
              const n = (a.new_values ?? {}) as typeof o;
              const what = a.action === 'delete'
                ? `Removed ${o.sku} × ${o.bottles} (${fmtUsd(toCents(o.paid_amount))})`
                : [
                    o.bottles !== n.bottles && `${o.sku}: ${o.bottles} → ${n.bottles} bottles`,
                    o.sale_date !== n.sale_date && `date ${o.sale_date} → ${n.sale_date}`,
                    o.location_code !== n.location_code && `location ${o.location_code} → ${n.location_code}`,
                    o.type !== n.type && `type ${o.type} → ${n.type}`,
                  ].filter(Boolean).join(', ') || `${o.sku}: notes changed`;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>{what}</span>
                  <span className="text-muted-foreground">
                    {a.changed_by_name ?? 'Unknown'} · {new Date(a.changed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
