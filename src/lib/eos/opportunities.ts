import { createClient } from '@/lib/supabase/server';

export type Opportunity = {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  owner_name: string | null;
  owner_email: string | null;
  term: 'short' | 'long';
  status: 'open' | 'in_progress' | 'solved' | 'on_hold';
  created_by: string | null;
  sort_order: number | null;
  /** Resolved display name of the creator (from profiles by created_by email). */
  creator_name: string | null;
  created_at: string;
  updated_at: string;
};

function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** Pretty display name from a profile row / email fallback. */
function displayNameFromEmail(email: string | null, byEmail: Map<string, string>): string | null {
  if (!email) return null;
  const full = byEmail.get(email.toLowerCase());
  if (full && full.trim()) return full.trim();
  // Fall back to the email's local part, title-cased (e.g. "pheintzman" → "Pheintzman").
  const local = email.split('@')[0] ?? email;
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : email;
}

/** email(lowercased) → full_name map from profiles. */
async function creatorNameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from('profiles').select('email, full_name');
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    if (p.email) m.set(String(p.email).toLowerCase(), String(p.full_name ?? ''));
  }
  return m;
}

/** Manual order first (sort_order asc), then newest created first as a tiebreak. */
function bySortOrder(a: Opportunity, b: Opportunity): number {
  const ao = a.sort_order, bo = b.sort_order;
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  return a.created_at.localeCompare(b.created_at); // stable fallback by creation
}

/**
 * @param archived  false (default) = active: not solved, or solved within the
 *                  last 7 days. true = archived: solved 7+ days ago.
 */
export async function getOpportunities(archived = false): Promise<Opportunity[]> {
  const supabase = await createClient();
  const cutoff = sevenDaysAgoISO();
  let query = supabase.from('eos_opportunities').select('*');
  query = archived
    ? query.eq('status', 'solved').lte('updated_at', cutoff)
    : query.or(`status.neq.solved,updated_at.gt.${cutoff}`);
  const { data, error } = await query;
  if (error) throw error;

  const byEmail = await creatorNameMap(supabase);
  const rows = (data ?? []).map((r) => ({
    ...(r as Omit<Opportunity, 'creator_name'>),
    creator_name: displayNameFromEmail((r as { created_by: string | null }).created_by, byEmail),
  })) as Opportunity[];

  return rows.sort(bySortOrder);
}

export async function createOpportunity(data: {
  title: string;
  description?: string;
  priority?: string;
  owner_name?: string;
  owner_email?: string;
  term?: string;
  status?: string;
}): Promise<Opportunity> {
  const supabase = await createClient();

  // Stamp the creator (email) and place the new item at the end of the order.
  const { data: auth } = await supabase.auth.getUser();
  const created_by = auth.user?.email ?? null;

  const { data: maxRow } = await supabase
    .from('eos_opportunities')
    .select('sort_order')
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data: result, error } = await supabase
    .from('eos_opportunities')
    .insert({ ...data, created_by, sort_order: nextOrder })
    .select()
    .single();
  if (error) throw error;

  const byEmail = await creatorNameMap(supabase);
  return {
    ...(result as Omit<Opportunity, 'creator_name'>),
    creator_name: displayNameFromEmail(created_by, byEmail),
  } as Opportunity;
}

export async function updateOpportunity(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    priority: string | null;
    owner_name: string | null;
    owner_email: string | null;
    term: string;
    status: string;
  }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_opportunities')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Persist a new ordering. Rewrites sort_order to each id's position (1-based) in
 * the given array, so the result is gap-free regardless of prior values.
 */
export async function reorderOpportunities(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('eos_opportunities').update({ sort_order: i + 1 }).eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_opportunities').delete().eq('id', id);
  if (error) throw error;
}
