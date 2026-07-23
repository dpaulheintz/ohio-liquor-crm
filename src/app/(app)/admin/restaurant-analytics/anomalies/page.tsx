import { createAdminClient } from '@/lib/supabase/server';
import { AnomaliesClient, type AnomalyDaily } from './anomalies-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Weekly Anomalies | High Bank CRM' };

const PAGE_SIZE = 1000;

export default async function WeeklyAnomaliesPage() {
  const supabase = createAdminClient();

  // ~20 weeks of history: enough to show 8 weeks daily and compute an 8-week
  // same-day-of-week rolling baseline for every displayed day.
  const floorDate = new Date();
  floorDate.setDate(floorDate.getDate() - 20 * 7);
  const floor = floorDate.toISOString().slice(0, 10);

  // Restaurant locations that carry invoice (cost) data — keeps the combined
  // invoice-spend series on a consistent location set.
  const { data: costLocs } = await supabase.from('daily_costs').select('location_id');
  const costLocationIds = new Set((costLocs ?? []).map((c) => c.location_id as string));

  // ── daily_sales → per-day combined revenue / labor / covers ──
  const salesByDate = new Map<string, { revenue: number; labor: number; covers: number }>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_sales')
      .select('business_date, total_revenue, labor_cost, guest_count')
      .gte('business_date', floor)
      .order('business_date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      const d = String(r.business_date);
      const e = salesByDate.get(d) ?? { revenue: 0, labor: 0, covers: 0 };
      e.revenue += Number(r.total_revenue ?? 0);
      e.labor += Number(r.labor_cost ?? 0);
      e.covers += Number(r.guest_count ?? 0);
      salesByDate.set(d, e);
    }
    if (data.length < PAGE_SIZE) break;
  }

  // ── daily_costs → per-day combined invoice spend ──
  const spendByDate = new Map<string, number>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_costs')
      .select('date, location_id, cogs_total')
      .gte('date', floor)
      .order('date', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      if (!costLocationIds.has(r.location_id as string)) continue;
      const d = String(r.date);
      spendByDate.set(d, (spendByDate.get(d) ?? 0) + Number(r.cogs_total ?? 0));
    }
    if (data.length < PAGE_SIZE) break;
  }

  // Merge into a single sorted daily series.
  const allDates = new Set<string>([...salesByDate.keys(), ...spendByDate.keys()]);
  const daily: AnomalyDaily[] = [...allDates].sort().map((date) => {
    const s = salesByDate.get(date);
    return {
      date,
      revenue: s?.revenue ?? 0,
      labor: s?.labor ?? 0,
      covers: s?.covers ?? 0,
      invoiceSpend: spendByDate.get(date) ?? 0,
    };
  });

  const dataThrough = daily.length ? daily[daily.length - 1].date : null;

  return <AnomaliesClient daily={daily} dataThrough={dataThrough} />;
}
