import { NextResponse } from 'next/server';
import { getAccountingAccess, audit } from '@/lib/fin/server';
import { getFinData, pickPeriod } from '@/lib/fin/page-data';
import { buildPackage, packagePdf, packageXlsx } from '@/lib/fin/package';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Month-end package: /api/accounting/package?m=2026-10&format=pdf|xlsx (accounting access only).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = await createClient();
  const access = await getAccountingAccess(supabase);
  if (!access.allowed) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'pdf';
  const d = await getFinData();
  const period = pickPeriod(d, url.searchParams.get('m') ?? undefined);
  if (!d.loaded.includes(period)) return NextResponse.json({ error: 'No P&L for that month' }, { status: 404 });
  const model = buildPackage(d, period);
  const bytes = format === 'pdf' ? await packagePdf(model) : await packageXlsx(model);
  await audit(supabase, 'package_download', period, { format });
  const name = `High-Bank-Month-End-${period.slice(0, 7)}${model.status === 'open' ? '-OPEN' : ''}.${format}`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
