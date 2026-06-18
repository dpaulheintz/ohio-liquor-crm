import type { Metadata } from 'next';
import { getMetrics, getEntries } from '@/lib/eos/scorecard';

export const metadata: Metadata = { title: 'EOS Dashboard | High Bank' };
import { getWeekStarts } from '@/lib/eos/scorecard-utils';
import { getBarrels } from '@/lib/eos/barrels';
import { getTodos, getTodosByMeetingId } from '@/lib/eos/todos';
import { getOpportunities } from '@/lib/eos/opportunities';
import { getHeadlines } from '@/lib/eos/headlines';
import { getMeetings, getMeetingNotes } from '@/lib/eos/meetings';
import EosDashboardClient from './eos-dashboard-client';

export const dynamic = 'force-dynamic';

export default async function EosDashboardPage() {
  const weekStarts = getWeekStarts(4);

  const [metrics, entries, barrels, todos, opportunities, headlines, meetings] = await Promise.all([
    getMetrics(),
    getEntries(weekStarts),
    getBarrels(),
    getTodos(),
    getOpportunities(),
    getHeadlines(),
    getMeetings(),
  ]);

  const recentMeeting = meetings[0] ?? null;
  const [recentNotes, recentMeetingTodos] = recentMeeting
    ? await Promise.all([
        getMeetingNotes(recentMeeting.id),
        getTodosByMeetingId(recentMeeting.id),
      ])
    : [[], []];

  return (
    <div className="px-6 py-8 text-[#F5ECD7] min-h-full">
      <EosDashboardClient
        metrics={metrics}
        entries={entries}
        weekStarts={weekStarts}
        barrels={barrels}
        todos={todos}
        opportunities={opportunities}
        initialHeadlines={headlines}
        recentMeeting={recentMeeting}
        recentNotes={recentNotes}
        recentMeetingTodos={recentMeetingTodos}
      />
    </div>
  );
}
