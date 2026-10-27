import { notFound } from 'next/navigation';
import { loadConfig, loadEngineFiles, loadRun, loadRunDetail, requirePayroll, toPayLine } from '@/lib/payroll/server';
import { summarize } from '@/lib/payroll/engine';
import { RunClient } from './run-client';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requirePayroll();
  const run = await loadRun(supabase, id);
  if (!run) notFound();
  const [config, detail, files, { data: savedMappings }] = await Promise.all([
    loadConfig(supabase),
    loadRunDetail(supabase, id),
    loadEngineFiles(supabase, id),
    supabase.from('payroll_column_mappings').select('header_signature, file_kind, mapping'),
  ]);
  const summaries = summarize(detail.lines.map(toPayLine), files);

  return (
    <RunClient
      key={`${run.status}-${run.processed_at ?? ''}-${detail.lines.length}-${detail.flags.length}`}
      run={run}
      files={detail.files}
      lines={detail.lines}
      flags={detail.flags}
      summaries={summaries}
      config={{ locations: config.locations, employees: config.employees, paycodes: config.paycodes }}
      savedMappings={savedMappings ?? []}
    />
  );
}
