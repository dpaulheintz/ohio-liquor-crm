import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/toast/sync';

/**
 * POST /api/toast-sync
 *
 * Triggers a Toast → Supabase sync.
 * Protected by a shared secret in the `Authorization` header.
 *
 * Query params:
 *   mode       — "daily" (default) or "backfill"
 *   location   — filter to a single location name (e.g. "Grandview")
 *   startDate  — override backfill start (YYYY-MM-DD)
 *   endDate    — override backfill end (YYYY-MM-DD)
 *
 * Examples:
 *   # Daily sync (yesterday, all locations)
 *   curl -X POST ".../api/toast-sync" -H "Authorization: Bearer $CRON_SECRET"
 *
 *   # Test: one location, one week
 *   curl -X POST ".../api/toast-sync?mode=backfill&location=Grandview&startDate=2024-01-01&endDate=2024-01-07" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 *   # Full backfill
 *   curl -X POST ".../api/toast-sync?mode=backfill" -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: NextRequest) {
  // Verify authorization (skip if SYNC_SECRET is not configured)
  const authHeader = request.headers.get('authorization');
  const syncSecret = process.env.SYNC_SECRET;

  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode') === 'backfill' ? 'backfill' : 'daily';
  const locationFilter = sp.get('location') ?? undefined;
  const startDate = sp.get('startDate') ?? undefined;
  const endDate = sp.get('endDate') ?? undefined;
  const stepParam = sp.get('step');
  const step = (stepParam === 'metrics' || stepParam === 'items') ? stepParam : 'all';

  try {
    const results = await runSync({ mode, locationFilter, startDate, endDate, step });
    return NextResponse.json({ ok: true, mode, locationFilter, startDate, endDate, results });
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
