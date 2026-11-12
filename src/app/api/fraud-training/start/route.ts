// "Scam or Legit?": deal a fresh deck and return a signed run token listing the dealt cards. Public.
import { NextRequest, NextResponse } from 'next/server';
import { dealDeck, quarterOf } from '@/lib/fraud-training/game';
import { issueRunToken, newNonce, underRateLimit } from '@/lib/fraud-training/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!(await underRateLimit(request.headers, 'start'))) return NextResponse.json({ ok: false }, { status: 429 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const quarter = quarterOf();
  const nonce = newNonce();
  const ids = dealDeck(quarter, nonce);
  const token = issueRunToken({ q: quarter, t: Date.now(), n: nonce, ids });
  return NextResponse.json({ ok: true, token, quarter, ids }, { headers: { 'Cache-Control': 'no-store' } });
}
