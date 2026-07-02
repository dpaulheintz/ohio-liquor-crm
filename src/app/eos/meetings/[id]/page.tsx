import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMeeting, getMeetingNotes, getMeetingRatings } from '@/lib/eos/meetings';

export const metadata: Metadata = { title: 'Meeting Summary | High Bank EOS' };
import { getTodosByMeetingId } from '@/lib/eos/todos';
import SummaryClient from './summary-client';

export const dynamic = 'force-dynamic';

export default async function MeetingSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) redirect('/eos/meetings');

  const [notes, meetingTodos, ratings] = await Promise.all([
    getMeetingNotes(id),
    getTodosByMeetingId(id),
    getMeetingRatings(id),
  ]);

  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-3xl mx-auto">
        <SummaryClient meeting={meeting} notes={notes} meetingTodos={meetingTodos} ratings={ratings} />
      </div>
    </div>
  );
}
