import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { ExamplesClient } from './examples-client';

export const dynamic = 'force-dynamic';

export default async function PayrollExamplesPage() {
  const { supabase } = await requirePayroll();
  const [config, { data: examples }, { data: savedMappings }] = await Promise.all([
    loadConfig(supabase),
    supabase.from('payroll_examples').select('id, name, period_start, period_end, notes, toast_files, expected_name, last_result, last_run_at').order('created_at'),
    supabase.from('payroll_column_mappings').select('header_signature, file_kind, mapping'),
  ]);
  return (
    <ExamplesClient
      locations={config.locations}
      savedMappings={savedMappings ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      examples={(examples ?? []).map((e: any) => ({
        id: e.id, name: e.name, period_start: e.period_start, period_end: e.period_end, notes: e.notes,
        files: (e.toast_files ?? []).length, expected_name: e.expected_name,
        matchPct: e.last_result?.matchPct ?? null, last_run_at: e.last_run_at,
        counts: e.last_result ? { matched: e.last_result.matched, mismatched: e.last_result.mismatched?.length ?? 0, missing: e.last_result.missing?.length ?? 0, extra: e.last_result.extra?.length ?? 0 } : null,
      }))}
    />
  );
}
