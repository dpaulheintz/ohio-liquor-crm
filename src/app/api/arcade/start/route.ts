// Barrel Arcade: a signed run token, fetched by /play when a game starts. Public.
import { NextRequest, NextResponse } from 'next/server';
import { isBoardSlug } from '@/lib/arcade/config';
import { issueRunToken } from '@/lib/arcade/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let game: unknown;
  try {
    ({ game } = await request.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isBoardSlug(game)) return NextResponse.json({ ok: false }, { status: 400 });
  return NextResponse.json({ ok: true, token: issueRunToken(game) }, { headers: { 'Cache-Control': 'no-store' } });
}
