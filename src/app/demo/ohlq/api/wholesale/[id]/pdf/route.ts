import { NextResponse } from 'next/server';
import { getSale } from '@/lib/ohlq-demo/server';
import { renderA3aPdf } from '@/lib/ohlq-demo/pdf';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sale = await getSale((await params).id);
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const pdf = await renderA3aPdf(sale);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="A-3a ${sale.ref_no}.pdf"`,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
