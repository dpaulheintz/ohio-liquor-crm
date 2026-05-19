'use server';

import { createAdminClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One row per individual KPI event (one visit may have multiple) */
export interface KpiEventRow {
  id: string;           // visit_kpis.id
  visit_id: string;
  visited_at: string;
  kpi: string;          // kpi_type
  kpi_quantity: number; // always ≥ 1
  sold_status: 'sold' | 'unsold';
  notes: string | null;
  visit_type: 'in_person' | 'phone_call';
  rep_id: string;
  rep_name: string | null;
  rep_email: string;
  account_id: string;
  account_name: string;
  photo_count: number;
  photo_urls: string[];
}

export interface KpiDashboardData {
  kpiEvents: KpiEventRow[];
  totalVisitCount: number;
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function getKpiDashboardData(): Promise<KpiDashboardData> {
  const supabase = createAdminClient();

  const [eventResult, countResult] = await Promise.all([
    // Query from visit_kpis, join up to visit_logs and its relations
    supabase
      .from('visit_kpis')
      .select(`
        id,
        kpi_type,
        kpi_quantity,
        sold_status,
        visit:visit_logs!visit_kpis_visit_id_fkey(
          id,
          visited_at,
          notes,
          visit_type,
          account_id,
          rep_id,
          account:accounts!visit_logs_account_id_fkey(id, display_name),
          rep:profiles!visit_logs_rep_id_fkey(id, full_name, email),
          visit_photos(id, photo_url)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5000),

    supabase
      .from('visit_logs')
      .select('*', { count: 'exact', head: true }),
  ]);

  if (eventResult.error)  throw new Error(`KPI fetch failed: ${eventResult.error.message}`);
  if (countResult.error)  throw new Error(`Count failed: ${countResult.error.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiEvents: KpiEventRow[] = (eventResult.data ?? []).map((r: any) => {
    const v = r.visit;
    return {
      id:           String(r.id),
      visit_id:     String(v?.id ?? ''),
      visited_at:   String(v?.visited_at ?? ''),
      kpi:          String(r.kpi_type),
      kpi_quantity: Number(r.kpi_quantity ?? 1),
      sold_status:  (r.sold_status ?? 'sold') as 'sold' | 'unsold',
      notes:        v?.notes ? String(v.notes) : null,
      visit_type:   (v?.visit_type ?? 'in_person') as 'in_person' | 'phone_call',
      rep_id:       String(v?.rep_id ?? ''),
      rep_name:     v?.rep?.full_name ? String(v.rep.full_name) : null,
      rep_email:    String(v?.rep?.email ?? ''),
      account_id:   String(v?.account_id ?? ''),
      account_name: String(v?.account?.display_name ?? 'Unknown'),
      photo_count:  Array.isArray(v?.visit_photos) ? v.visit_photos.length : 0,
      photo_urls:   Array.isArray(v?.visit_photos) ? v.visit_photos.map((p: any) => String(p.photo_url)) : [],
    };
  });

  return {
    kpiEvents,
    totalVisitCount: countResult.count ?? 0,
  };
}
