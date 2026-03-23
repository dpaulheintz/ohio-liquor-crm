'use server';

import { createClient } from '@/lib/supabase/server';

export async function getKpiSummary({
  startDate,
  endDate,
  repId,
}: {
  startDate?: string;
  endDate?: string;
  repId?: string;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('visit_logs')
    .select(
      `*, account:accounts!visit_logs_account_id_fkey(id, display_name), rep:profiles!visit_logs_rep_id_fkey(id, full_name, email)`
    )
    .not('kpi', 'is', null);

  if (startDate) {
    query = query.gte('visited_at', startDate);
  }
  if (endDate) {
    // If only a date was provided (no time component), include the full day
    const endValue = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
    query = query.lte('visited_at', endValue);
  }
  if (repId) {
    query = query.eq('rep_id', repId);
  }

  query = query.order('visited_at', { ascending: false }).limit(200);

  const { data, error } = await query;
  if (error) throw error;

  const visits = data ?? [];

  // Aggregate counts by KPI type
  const counts: Record<string, number> = {};
  for (const visit of visits) {
    if (visit.kpi) {
      counts[visit.kpi] = (counts[visit.kpi] || 0) + 1;
    }
  }

  return { counts, visits };
}
