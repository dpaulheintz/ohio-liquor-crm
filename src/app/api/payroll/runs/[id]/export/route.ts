import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPayrollAccess, loadConfig, loadRun, loadRunDetail, log, toPayLine } from '@/lib/payroll/server';
import { buildOutputRows, toCsv, toXlsx } from '@/lib/payroll/output';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /api/* skips the auth proxy: access is checked here and again by RLS on every read.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = await createClient();
  const access = await getPayrollAccess(supabase);
  if (!access.userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const run = await loadRun(supabase, id);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (run.status !== 'approved' && run.status !== 'exported') {
    return NextResponse.json({ error: 'Approve the run before downloading the Paycom file.' }, { status: 409 });
  }

  const [config, detail] = await Promise.all([loadConfig(supabase), loadRunDetail(supabase, id)]);
  const { headers, rows } = buildOutputRows(detail.lines.map(toPayLine), { periodStart: run.period_start, periodEnd: run.period_end, ...config });

  if (run.status === 'approved') {
    const { error } = await supabase.from('payroll_runs').update({ status: 'exported' }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await log(supabase, 'download_paycom_file', { rows: rows.length, file_type: config.template.file_type }, id);

  const base = `Paycom payroll ${run.period_start} to ${run.period_end}`;
  if (config.template.file_type === 'xlsx') {
    const bytes = await toXlsx(headers, rows);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
