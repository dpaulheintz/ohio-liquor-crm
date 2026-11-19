// Accounting: one data load per request, shared by the layout and the page (React cache).
import { cache } from 'react';
import { ensureReviewFresh, loadAll, loadChecklist, loadFlags, requireAccounting } from './server';
import { addMonths } from './shared';

export const getFinData = cache(async () => {
  const { supabase, userId } = await requireAccounting();
  const d = await loadAll(supabase);
  await ensureReviewFresh(supabase, d);
  const [flags, checklist] = await Promise.all([loadFlags(supabase), loadChecklist(supabase)]);
  const loaded = [...new Set(d.lines.map((l) => l.period))].sort();
  return { ...d, flags, checklist, loaded, userId };
});

export type FinPageData = Awaited<ReturnType<typeof getFinData>>;

/** ?m=2026-10 → "2026-10-01"; defaults to the latest month with an upload. */
export function pickPeriod(d: { loaded: string[] }, m?: string | string[]): string {
  const v = Array.isArray(m) ? m[0] : m;
  if (v && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return d.loaded.at(-1) ?? `${new Date().toISOString().slice(0, 7)}-01`;
}

export const ym = (period: string) => period.slice(0, 7);
export const prevPeriod = (p: string) => addMonths(p, -1);
