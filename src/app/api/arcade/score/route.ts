// Barrel Arcade: submit a top-10 score with 3 initials. Public.
//
// Order of checks: rate limit (10 per 10 minutes per visitor) → shape (board, initials, whole-number
// score) → blocklist → run token + minimum play time + plausibility → top-10 check and insert (DB).
// Anything that looks like cheating gets a bare { ok: false } with no reason.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BOARDS, INITIALS_RE, isBoardSlug, RATE_LIMIT, scoreIsPlausible } from '@/lib/arcade/config';
import { isBlockedInitials } from '@/lib/arcade/blocklist';
import { rateKeyFromHeaders, readBoards, verifyRunToken } from '@/lib/arcade/server';

export const dynamic = 'force-dynamic';

const quiet = (status = 400) => NextResponse.json({ ok: false }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const db = createAdminClient();

  // Rate limit. Old events are cleared first, so a key never outlives its 10-minute window by much.
  const key = rateKeyFromHeaders(request.headers);
  const since = new Date(Date.now() - RATE_LIMIT.windowMs).toISOString();
  await db.from('arcade_rate_events').delete().lt('created_at', since);
  const { count, error: rateErr } = await db
    .from('arcade_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('key_hash', key)
    .gte('created_at', since);
  if (rateErr) return quiet(503);
  if ((count ?? 0) >= RATE_LIMIT.max) return quiet(429);
  await db.from('arcade_rate_events').insert({ key_hash: key });

  let body: { game?: unknown; initials?: unknown; score?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return quiet();
  }
  const { game, initials, score, token } = body;
  if (!isBoardSlug(game) || typeof initials !== 'string' || !INITIALS_RE.test(initials)) return quiet();
  if (typeof score !== 'number' || !Number.isInteger(score)) return quiet();

  if (isBlockedInitials(initials)) {
    return NextResponse.json({ ok: false, reason: 'blocked' }, { status: 422 });
  }

  const now = Date.now();
  const start = verifyRunToken(token, game, now);
  if (start === null) return quiet();
  if (!scoreIsPlausible(BOARDS[game], score, (now - start) / 1000)) return quiet();

  const { data, error } = await db.rpc('arcade_submit_score', { p_game: game, p_initials: initials, p_score: score });
  if (error) {
    console.error('arcade submit:', error.message);
    return quiet(503);
  }
  const res = data as { ok: boolean; rank?: number; reason?: string };
  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: res.reason }, { status: res.reason === 'blocked' ? 422 : 409 });
  }

  // Send the fresh board back so the page can show it with this row highlighted.
  let board: [string, number][] = [];
  try {
    board = (await readBoards()).boards[game] ?? [];
  } catch {
    /* the page falls back to its own copy */
  }
  return NextResponse.json({ ok: true, rank: res.rank, board }, { headers: { 'Cache-Control': 'no-store' } });
}
