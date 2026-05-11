'use server';

import { createAdminClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiVisitRow {
  id: string;
  visited_at: string;
  kpi: string;
  kpi_quantity: number | null;
  notes: string | null;
  rep_id: string;
  rep_name: string | null;
  rep_email: string;
  account_id: string;
  account_name: string;
  photo_count: number;
}

export interface KpiDashboardData {
  kpiVisits: KpiVisitRow[];
  totalVisitCount: number;
}

// ─── Server action ────────────────────────────────────────────────────────────

export async function getKpiDashboardData(): Promise<KpiDashboardData> {
  const supabase = createAdminClient();

  const [visitResult, countResult] = await Promise.all([
    supabase
      .from('visit_logs')
      .select(`
        id, visited_at, kpi, kpi_quantity, notes, rep_id, account_id,
        account:accounts!visit_logs_account_id_fkey(id, display_name),
        rep:profiles!visit_logs_rep_id_fkey(id, full_name, email),
        visit_photos(id)
      `)
      .not('kpi', 'is', null)
      .order('visited_at', { ascending: false })
      .limit(5000),
    supabase
      .from('visit_logs')
      .select('*', { count: 'exact', head: true }),
  ]);

  if (visitResult.error) throw new Error(`KPI fetch failed: ${visitResult.error.message}`);
  if (countResult.error) throw new Error(`Count failed: ${countResult.error.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiVisits: KpiVisitRow[] = (visitResult.data ?? []).map((r: any) => ({
    id: String(r.id),
    visited_at: String(r.visited_at),
    kpi: String(r.kpi),
    kpi_quantity: r.kpi_quantity != null ? Number(r.kpi_quantity) : null,
    notes: r.notes ? String(r.notes) : null,
    rep_id: String(r.rep_id),
    rep_name: r.rep?.full_name ? String(r.rep.full_name) : null,
    rep_email: String(r.rep?.email ?? ''),
    account_id: String(r.account_id),
    account_name: String(r.account?.display_name ?? 'Unknown'),
    photo_count: Array.isArray(r.visit_photos) ? r.visit_photos.length : 0,
  }));

  return {
    kpiVisits,
    totalVisitCount: countResult.count ?? 0,
  };
}
