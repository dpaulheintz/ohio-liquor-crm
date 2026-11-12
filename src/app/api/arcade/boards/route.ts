// Barrel Arcade: this week's top 10 for every board, plus the initials blocklist for instant feedback.
// Public, read-only.
import { NextResponse } from 'next/server';
import { readBlockedInitials, readBoards } from '@/lib/arcade/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [boards, blocked] = await Promise.all([readBoards(), readBlockedInitials()]);
    return NextResponse.json({ ok: true, ...boards, blocked }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('arcade boards:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
