import { createClient } from '@/lib/supabase/server';

export type Headline = {
  id: string;
  title: string;
  headline_type: 'good_news' | 'customer_win' | 'employee_update';
  owner_name: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getHeadlines(): Promise<Headline[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_headlines')
    .select('*')
    .order('created_at', { ascending: false });
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
