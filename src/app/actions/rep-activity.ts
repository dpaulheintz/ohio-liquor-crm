'use server';

import { createAdminClient } from '@/lib/supabase/server';
import type { KpiEventRow } from '@/app/actions/kpi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepVisitRow {
  id: string;
  rep_id: string;
  account_id: string;
  account_type: string;
  visited_at: string;
}

export interface RepKpiEventRow extends KpiEventRow {
  account_type: string;
}

export interface RepActivityData {
  reps: { id: string; full_name: string | null; email: string }[];
  visits: RepVisitRow[];
  kpiEvents: RepKpiEventRow[];
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

/**
 * Powers the Admin Dashboard's Rep Activity tables (Visits by Rep, KPIs by
 * Rep). Fetches the full, unbounded rep roster / visit / KPI-event sets and
 * lets the client aggregate and date-filter — same "fetch once, filter in the
 * browser" pattern as getKpiDashboardData() and dashboard.ts's repLeaderboard.
 * At current volume (~190 visit_logs, ~70 visit_kpis) this is trivial; if
 * visit_logs grows past ~5-10k rows, add a `.gte('visited_at', <~15mo ago>)`
 * floor here the way dashboard.ts bounds its 60-day query — 15 months safely
 * covers "Last Quarter", the widest period this UI offers.
 */
export async function getRepActivityData(): Promise<RepActivityData> {
  const supabase = createAdminClient();

  const [repsResult, visitsResult, kpiResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('role', ['rep', 'admin'])
      .order('full_name'),

    supabase
      .from('visit_logs')
      .select(`
        id, rep_id, account_id, visited_at,
        account:accounts!visit_logs_account_id_fkey(id, type)
      `),

    supabase
      .from('visit_kpis')
      .select(`
        id,
        kpi_type,
        kpi_quantity,
        sold_status,
        display_type,
        visit:visit_logs!visit_kpis_visit_id_fkey(
          id,
          visited_at,
          notes,
          visit_type,
          account_id,
          rep_id,
          account:accounts!visit_logs_account_id_fkey(id, display_name, city, agency_id, type),
          rep:profiles!visit_logs_rep_id_fkey(id, full_name, email)
        )
      `)
      .limit(5000),
  ]);

  if (repsResult.error) throw new Error(`Reps fetch failed: ${repsResult.error.message}`);
  if (visitsResult.error) throw new Error(`Visits fetch failed: ${visitsResult.error.message}`);
  if (kpiResult.error) throw new Error(`KPI events fetch failed: ${kpiResult.error.message}`);

  const reps = repsResult.data ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visits: RepVisitRow[] = (visitsResult.data ?? []).map((r: any) => ({
    id: String(r.id),
    rep_id: String(r.rep_id ?? ''),
    account_id: String(r.account_id ?? ''),
    account_type: String(r.account?.type ?? ''),
    visited_at: String(r.visited_at ?? ''),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiEvents: RepKpiEventRow[] = (kpiResult.data ?? []).map((r: any) => {
    const v = r.visit;
    return {
      id:               String(r.id),
      visit_id:         String(v?.id ?? ''),
      visited_at:       String(v?.visited_at ?? ''),
      kpi:              String(r.kpi_type),
      kpi_quantity:     Number(r.kpi_quantity ?? 1),
      sold_status:      (r.sold_status ?? 'sold') as 'sold' | 'unsold',
      display_type:     r.display_type ? String(r.display_type) : null,
      notes:            v?.notes ? String(v.notes) : null,
      visit_type:       (v?.visit_type ?? 'in_person') as 'in_person' | 'phone_call',
      rep_id:           String(v?.rep_id ?? ''),
      rep_name:         v?.rep?.full_name ? String(v.rep.full_name) : null,
      rep_email:        String(v?.rep?.email ?? ''),
      account_id:       String(v?.account_id ?? ''),
      account_name:     String(v?.account?.display_name ?? 'Unknown'),
      account_city:     v?.account?.city ? String(v.account.city) : null,
      account_agency_id: v?.account?.agency_id ? String(v.account.agency_id) : null,
      account_type:     String(v?.account?.type ?? ''),
      photo_count:      0,
      photo_urls:       [],
    };
  });

  return { reps, visits, kpiEvents };
}
