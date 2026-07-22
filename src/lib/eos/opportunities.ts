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
  created_at: string;
  updated_at: string;
};

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Opportunity[];
  return rows.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? ''] ?? 99;
    const pb = PRIORITY_ORDER[b.priority ?? ''] ?? 99;
    return pa - pb;
  });
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
  const { data: result, error } = await supabase
    .from('eos_opportunities')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Opportunity;
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

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_opportunities').delete().eq('id', id);
  if (error) throw error;
}
