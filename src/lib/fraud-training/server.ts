// "Scam or Legit?" — server-only helpers: signed run tokens, rate-limit keys (same pattern as
// src/lib/arcade/server.ts).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Signing key: FRAUD_TRAINING_SECRET if set, otherwise derived from the service-role key (server-only,
// already in every environment), so no new env var is needed.
function secret(): Buffer {
  const own = process.env.FRAUD_TRAINING_SECRET;
  if (own) return Buffer.from(own);
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createHmac('sha256', base).update('hb-fraud-training-run-token-v1').digest();
}
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export interface RunToken { q: string; t: number; n: string; ids: string[] }

export const newNonce = () => randomBytes(9).toString('base64url');

/** "<base64url payload>.<signature>" — payload = quarter, start time, nonce, dealt card ids. */
export function issueRunToken(run: RunToken): string {
  const payload = Buffer.from(JSON.stringify(run)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

export function verifyRunToken(token: unknown, now = Date.now()): RunToken | null {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const run = JSON.parse(Buffer.from(payload, 'base64url').toString()) as RunToken;
    if (!run || typeof run.t !== 'number' || !Array.isArray(run.ids) || typeof run.q !== 'string' || typeof run.n !== 'string') return null;
    if (run.t > now + 5000 || now - run.t > TOKEN_TTL_MS) return null;
    return run;
  } catch {
    return null;
  }
}

/** Keyed hash of the IP that changes every UTC day. The raw IP is never stored. */
export function rateKeyFromHeaders(h: Headers, now = new Date()): string {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return createHmac('sha256', secret()).update(`rate:${now.toISOString().slice(0, 10)}:${ip}`).digest('hex').slice(0, 32);
}

export const RATE_LIMITS = { start: 30, submit: 10 } as const;
const WINDOW_MS = 10 * 60 * 1000;

/** Records the event and returns false if this visitor is over the limit for `kind`. */
export async function underRateLimit(h: Headers, kind: keyof typeof RATE_LIMITS): Promise<boolean> {
  const db = createAdminClient();
  const key = rateKeyFromHeaders(h);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  await db.from('fraud_training_rate_events').delete().lt('created_at', since); // keep only the live window
  const { count, error } = await db
    .from('fraud_training_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('key_hash', key).eq('kind', kind).gte('created_at', since);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= RATE_LIMITS[kind]) return false;
  await db.from('fraud_training_rate_events').insert({ key_hash: key, kind });
  return true;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function completionCode(): string {
  const b = randomBytes(4);
  return 'FRD-' + [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}
