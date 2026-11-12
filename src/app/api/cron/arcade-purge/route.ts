// Daily (vercel.json): delete Barrel Arcade scores from past weeks and expired rate-limit events.
// The cutoff is "this Monday 12:00 AM America/New_York", computed in Postgres (arcade_week_start), so
// the UTC cron time and daylight saving don't matter. Boards already ignore past weeks on read; this
// just removes the rows.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc('arcade_purge');
  if (error) {
    console.error('arcade purge:', error.message);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
  return NextResponse.json(data);
}
