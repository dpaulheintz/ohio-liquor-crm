import { notFound } from 'next/navigation';
import { requirePayroll } from '@/lib/payroll/server';
import type { DiffResult } from '@/lib/payroll/diff';
import { ExampleDetail } from './example-detail';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PayrollExamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requirePayroll();
  const { data: ex } = await supabase.from('payroll_examples').select('id, name, period_start, period_end, notes, toast_files, expected_name, last_result, last_run_at').eq('id', id).maybeSingle();
  if (!ex) notFound();
  return (
    <ExampleDetail
      example={{
        id: ex.id, name: ex.name, period_start: ex.period_start, period_end: ex.period_end, notes: ex.notes,
        files: ((ex.toast_files ?? []) as { name: string; kind: string }[]).map((f) => ({ name: f.name, kind: f.kind })),
        expected_name: ex.expected_name, last_run_at: ex.last_run_at,
      }}
      result={(ex.last_result as DiffResult | null) ?? null}
    />
  );
}
