import type { Metadata } from 'next';
import { getMetrics, getEntries } from '@/lib/eos/scorecard';
import { getWeekStarts } from '@/lib/eos/scorecard-utils';
import { createClient } from '@/lib/supabase/server';
import { isEosUser } from '@/lib/eos-auth';
import ScorecardClient from './scorecard-client';

export const metadata: Metadata = { title: 'Scorecard | High Bank EOS' };
export const dynamic = 'force-dynamic';

export default async function EosScorecardPage() {
  const weekStarts = getWeekStarts(13);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [metrics, entries] = await Promise.all([
    getMetrics(),
    getEntries(weekStarts),
  ]);

  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-full">
        <ScorecardClient
          initialMetrics={metrics}
          initialEntries={entries}
          weekStarts={weekStarts}
          isAdmin={isEosUser(user?.email)}
        />
      </div>
    </div>
  );
}
