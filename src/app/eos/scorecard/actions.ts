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

export async function saveEntry(
  metricId: string,
  weekStart: string,
  value: string,
): Promise<void> {
  await upsertEntry(metricId, weekStart, value === '' ? null : value);
}

export async function addMetric(
  data: MetricFormData & { display_order: number },
): Promise<Metric> {
  return createMetric({
    title: data.title.trim(),
    goal_operator: data.goal_operator,
    goal_value: data.goal_value.trim(),
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
    goal_value: data.goal_value.trim(),
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
