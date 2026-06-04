import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/toast/sync';

/**
 * POST /api/toast-sync?mode=daily|backfill
 *
 * Triggers a Toast → Supabase sync.
 * Protected by a shared secret in the `Authorization` header
 * to prevent unauthorized triggering.
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Query params:
 *   mode: "daily" (default) or "backfill"
 *
 * Usage:
 *   curl -X POST "https://your-app.vercel.app/api/toast-sync?mode=daily" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get('mode') === 'backfill' ? 'backfill' : 'daily';

  try {
    const results = await runSync(mode);
    return NextResponse.json({ ok: true, mode, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[toast-sync] Fatal error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Also support GET for easy browser/cron testing
export async function GET(request: NextRequest) {
  return POST(request);
}
