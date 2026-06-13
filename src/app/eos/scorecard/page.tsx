import type { Metadata } from 'next';
import { getMetrics, getEntries } from '@/lib/eos/scorecard';

export const metadata: Metadata = { title: 'Scorecard | High Bank EOS' };
import { getWeekStarts } from '@/lib/eos/scorecard-utils';
import ScorecardClient from './scorecard-client';

export const dynamic = 'force-dynamic';

export default async function EosScorecardPage() {
  const weekStarts = getWeekStarts(13);
  const [metrics, entries] = await Promise.all([
    getMetrics(),
    getEntries(weekStarts),
  ]);

  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-full">
        <ScorecardClient
          initialMetrics={metrics}
          initialEntries={entries}
          weekStarts={weekStarts}
        />
      </div>
    </div>
  );
}
