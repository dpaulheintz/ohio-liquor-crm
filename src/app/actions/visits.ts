'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getVisits({
  repId,
  page = 1,
  pageSize = 20,
}: {
  repId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('visit_logs')
    .select(
      `*, account:accounts!visit_logs_account_id_fkey(id, display_name, type), rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*)`,
      { count: 'exact' }
    )
    .order('visited_at', { ascending: false });

  if (repId) {
    query = query.eq('rep_id', repId);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { visits: data ?? [], total: count ?? 0 };
}

export async function getVisitsByAccount(accountId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visit_logs')
    .select(
      `*, rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*)`
    )
    .eq('account_id', accountId)
    .order('visited_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function createVisit({
  accountId,
  notes,
  kpi,
  visitedAt,
  photoUrls,
}: {
  accountId: string;
  notes?: string;
  kpi?: string;
  visitedAt?: string;
  photoUrls?: { url: string; caption?: string; sort_order: number }[];
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create visit log
  const { data: visit, error: visitError } = await supabase
    .from('visit_logs')
    .insert({
      account_id: accountId,
      rep_id: user.id,
      notes: notes || null,
      kpi: kpi || null,
      visited_at: visitedAt || new Date().toISOString(),
    })
    .select()
    .single();

  if (visitError) throw visitError;

  // Create photo records if any
  if (photoUrls && photoUrls.length > 0) {
    const photoRecords = photoUrls.map((p) => ({
      visit_id: visit.id,
      photo_url: p.url,
      caption: p.caption || null,
      sort_order: p.sort_order,
    }));

    const { error: photoError } = await supabase
      .from('visit_photos')
      .insert(photoRecords);

    if (photoError) throw photoError;
  }

  revalidatePath('/');
  revalidatePath(`/accounts/${accountId}`);
  return visit;
}

export async function getRepActivity() {
  const supabase = await createClient();

  // Get all reps
  const { data: reps } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['rep', 'admin']);

  if (!reps) return [];

  // Get visit counts per rep for this week and month
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: visits } = await supabase
    .from('visit_logs')
    .select('rep_id, visited_at, account_id')
    .gte('visited_at', startOfMonth.toISOString());

  const repActivity = reps.map((rep) => {
    const repVisits = visits?.filter((v) => v.rep_id === rep.id) ?? [];
    const weekVisits = repVisits.filter(
      (v) => new Date(v.visited_at) >= startOfWeek
    );
    const uniqueAccounts = new Set(repVisits.map((v) => v.account_id));
    const lastVisit = repVisits.length > 0
      ? repVisits.reduce((latest, v) =>
          new Date(v.visited_at) > new Date(latest.visited_at) ? v : latest
        )
      : null;

    return {
      rep,
      visitsThisWeek: weekVisits.length,
      visitsThisMonth: repVisits.length,
      accountsVisited: uniqueAccounts.size,
      lastActive: lastVisit?.visited_at ?? null,
    };
  });

  return repActivity;
}
