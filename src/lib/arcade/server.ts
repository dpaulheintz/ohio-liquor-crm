// Barrel Arcade leaderboards: server-only helpers (run tokens, rate-limit keys, board reads).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { BLOCKED_INITIALS } from './blocklist';
import { isBoardSlug, TOKEN_TTL_MS, type BoardSlug } from './config';

// Signing key: ARCADE_TOKEN_SECRET if set, otherwise derived from the service-role key (server-only,
// already in every environment), so no new env var is needed.
function secret(): Buffer {
  const own = process.env.ARCADE_TOKEN_SECRET;
  if (own) return Buffer.from(own);
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createHmac('sha256', base).update('hb-arcade-run-token-v1').digest();
}

const b64url = (b: Buffer) => b.toString('base64url');
const sign = (payload: string) => b64url(createHmac('sha256', secret()).update(payload).digest());

/** Run token: "<board>.<start ms>.<nonce>.<signature>". */
export function issueRunToken(board: BoardSlug, now = Date.now()): string {
  const payload = `${board}.${now}.${b64url(randomBytes(9))}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the run's start time (ms) if the token is genuine, for this board and not expired. */
export function verifyRunToken(token: unknown, board: BoardSlug, now = Date.now()): number | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [g, t, , sig] = parts;
  const payload = parts.slice(0, 3).join('.');
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (!isBoardSlug(g) || g !== board) return null;
  const start = Number(t);
  if (!Number.isFinite(start) || start > now + 5000 || now - start > TOKEN_TTL_MS) return null;
  return start;
}

/** Rate-limit key: a keyed hash of the IP that changes every UTC day. The raw IP is never stored. */
export function rateKeyFromHeaders(h: Headers, now = new Date()): string {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return createHmac('sha256', secret()).update(`rate:${now.toISOString().slice(0, 10)}:${ip}`).digest('hex').slice(0, 32);
}

export interface BoardsPayload {
  weekStart: string;
  resetsAt: string;
  boards: Record<string, [string, number][]>;
}

export async function readBoards(): Promise<BoardsPayload> {
  const { data, error } = await createAdminClient().rpc('arcade_leaderboards');
  if (error) throw new Error(error.message);
  const d = data as { week_start: string; resets_at: string; boards: Record<string, [string, number][]> };
  return { weekStart: d.week_start, resetsAt: d.resets_at, boards: d.boards ?? {} };
}

/** Built-in list plus anything admins blocked from the CRM. */
export async function readBlockedInitials(): Promise<string[]> {
  const { data, error } = await createAdminClient().from('arcade_blocked_initials').select('initials');
  if (error) throw new Error(error.message);
  return [...new Set([...BLOCKED_INITIALS, ...(data ?? []).map((r) => r.initials as string)])].sort();
}
