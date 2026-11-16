import { NextResponse } from 'next/server';
import { assertDemoAccess, getTasting } from '@/lib/ohlq-demo/server';
import { renderTastingPdf } from '@/lib/ohlq-demo/pdf';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await assertDemoAccess(); } catch { return NextResponse.json({ error: 'Demo access code required' }, { status: 401 }); }
  const t = await getTasting((await params).id);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pdf = await renderTastingPdf(t);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="LIQ-19-0004 ${t.ref_no}.pdf"`,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
