import { createClient } from '@/lib/supabase/server';

export type Headline = {
  id: string;
  title: string;
  headline_type: 'good_news' | 'customer_win' | 'employee_update';
  owner_name: string | null;
  created_by: string | null;
  created_at: string;
};

/** ISO timestamp for `now - 7 days`. */
function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * @param archived  false (default) = active: created in the last 7 days.
 *                  true = archived: created 7+ days ago.
 */
export async function getHeadlines(archived = false): Promise<Headline[]> {
  const supabase = await createClient();
  const cutoff = sevenDaysAgoISO();
  let query = supabase.from('eos_headlines').select('*');
  query = archived
    ? query.lte('created_at', cutoff)
    : query.gt('created_at', cutoff);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Headline[];
}

export async function createHeadline(data: {
  title: string;
  headline_type: string;
  owner_name?: string;
}): Promise<Headline> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('eos_headlines')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Headline;
}

export async function updateHeadline(
  id: string,
  data: Partial<{ title: string; headline_type: string; owner_name: string | null }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_headlines').update(data).eq('id', id);
  if (error) throw error;
}

export async function deleteHeadline(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_headlines').delete().eq('id', id);
  if (error) throw error;
}
