import { redirect } from 'next/navigation';
import { getMeeting, getMeetingNotes } from '@/lib/eos/meetings';
import { getMetrics, getEntries } from '@/lib/eos/scorecard';
import { getWeekStarts } from '@/lib/eos/scorecard-utils';
import { getBarrels } from '@/lib/eos/barrels';
import { getTodos } from '@/lib/eos/todos';
import { getOpportunities } from '@/lib/eos/opportunities';
import { getHeadlines } from '@/lib/eos/headlines';
import RunnerClient from './runner-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Level 10 Meeting | High Bank EOS' };

export default async function MeetingRunnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; opportunity?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const meeting = await getMeeting(id);
  if (!meeting) redirect('/eos/meetings');
  if (meeting.ended_at) redirect(`/eos/meetings/${id}`);

  const weekStarts = getWeekStarts(13);
  const [notes, metrics, entries, barrels, todos, opportunities, headlines] =
    await Promise.all([
      getMeetingNotes(id),
      getMetrics(),
      getEntries(weekStarts),
      getBarrels(),
      getTodos(),
      getOpportunities(),
      getHeadlines(),
    ]);

  return (
    <RunnerClient
      meeting={meeting}
      initialNotes={notes}
      metrics={metrics}
      entries={entries}
      weekStarts={weekStarts}
      barrels={barrels}
      todos={todos}
      opportunities={opportunities}
      headlines={headlines}
      initialSection={sp.section}
      initialOpportunityId={sp.opportunity}
    />
  );
}
