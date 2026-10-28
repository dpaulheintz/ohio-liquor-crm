'use server';

import {
  upsertEntry,
  createMetric,
  updateMetric,
  deleteMetric,
  reorderMetrics,
  type Metric,
} from '@/lib/eos/scorecard';
import type { MetricFormData } from '@/components/eos/MetricModal';
import { normalizeScorecardValue } from '@/lib/eos/scorecard-utils';
import { createClient } from '@/lib/supabase/server';

function cleanGoal(goal: string, metricType: string): string {
  const v = normalizeScorecardValue(goal, metricType);
  if (!v) throw new Error('Goal must be a number.');
  return v;
}

export async function saveEntry(
  metricId: string,
  weekStart: string,
  value: string,
): Promise<string | null> {
  // Store the clean number (e.g. "10100"), never the typed text.
  const supabase = await createClient();
  const { data: metric, error } = await supabase.from('eos_scorecard_metrics').select('metric_type').eq('id', metricId).single();
  if (error) throw error;
  const clean = normalizeScorecardValue(value, metric.metric_type);
  if (clean === null) throw new Error('Not a number');
  await upsertEntry(metricId, weekStart, clean === '' ? null : clean);
  return clean === '' ? null : clean;
}

export async function addMetric(
  data: MetricFormData & { display_order: number },
): Promise<Metric> {
  return createMetric({
    title: data.title.trim(),
    goal_operator: data.goal_operator,
    goal_value: cleanGoal(data.goal_value, data.metric_type),
    metric_type: data.metric_type,
    owner_name: data.owner_name.trim() || undefined,
    owner_email: data.owner_email.trim() || undefined,
    display_order: data.display_order,
  });
}

export async function editMetric(
  id: string,
  data: MetricFormData,
): Promise<void> {
  await updateMetric(id, {
    title: data.title.trim(),
    goal_operator: data.goal_operator,
    goal_value: cleanGoal(data.goal_value, data.metric_type),
    metric_type: data.metric_type,
    owner_name: data.owner_name.trim() || null,
    owner_email: data.owner_email.trim() || null,
  });
}

export async function removeMetric(id: string): Promise<void> {
  await deleteMetric(id);
}

export async function reorderMetricsAction(orderedIds: string[]): Promise<void> {
  await reorderMetrics(orderedIds);
}
