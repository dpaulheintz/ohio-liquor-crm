import { createClient } from '@/lib/supabase/server';

export type Metric = {
  id: string;
  title: string;
  goal_operator: string;
  goal_value: string;
  metric_type: string;
  display_order: number;
  owner_name: string | null;
  owner_email: string | null;
  active: boolean;
  created_at: string;
};

export type Entry = {
  id: string;
  metric_id: string;
  week_start: string;
  value: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getMetrics(): Promise<Metric[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_scorecard_metrics')
    .select('*')
    .eq('active', true)
    .order('display_order');
  if (error) throw error;
  return (data ?? []) as Metric[];
}

export async function getEntries(weekStarts: string[]): Promise<Entry[]> {
  if (weekStarts.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_scorecard_entries')
    .select('*')
    .in('week_start', weekStarts);
  if (error) throw error;
  return (data ?? []) as Entry[];
}

export async function upsertEntry(
  metricId: string,
  weekStart: string,
  value: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_scorecard_entries')
    .upsert(
      {
        metric_id: metricId,
        week_start: weekStart,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'metric_id,week_start' },
    );
  if (error) throw error;
}

export async function createMetric(data: {
  title: string;
  goal_operator: string;
  goal_value: string;
  metric_type: string;
  owner_name?: string;
  owner_email?: string;
  display_order: number;
}): Promise<Metric> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('eos_scorecard_metrics')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Metric;
}

export async function updateMetric(
  id: string,
  data: Partial<{
    title: string;
    goal_operator: string;
    goal_value: string;
    metric_type: string;
    owner_name: string | null;
    owner_email: string | null;
    display_order: number;
  }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_scorecard_metrics')
    .update(data)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMetric(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_scorecard_metrics')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Persist a new metric ordering. Rewrites display_order to each id's position
 * (1-based) in the given array, so the result is always gap-free and collision-
 * free regardless of the prior values. Metric count is small (tens), so a
 * per-row update is fine.
 */
export async function reorderMetrics(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from('eos_scorecard_metrics').update({ display_order: i + 1 }).eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
