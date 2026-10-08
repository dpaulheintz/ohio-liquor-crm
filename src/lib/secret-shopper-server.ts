import { createHash } from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';

export function ipHashFromHeaders(h: Headers): string {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`secret-shopper:${ip}`).digest('hex').slice(0, 32);
}

export async function rateLimitCount(ipHash: string, kind: 'submit' | 'upload', windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await createAdminClient()
    .from('secret_shopper_rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('kind', kind)
    .gte('created_at', since);
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  return count ?? 0;
}

export async function recordRateEvent(ipHash: string, kind: 'submit' | 'upload'): Promise<void> {
  await createAdminClient().from('secret_shopper_rate_events').insert({ ip_hash: ipHash, kind });
}

/** Session-less anon client: public submissions always run as the `anon` role, even if the phone is logged in. */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
