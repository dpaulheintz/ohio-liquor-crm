import { redirect } from 'next/navigation';
import { getMeeting, getMeetingNotes } from '@/lib/eos/meetings';
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

  const [notes, meetingTodos] = await Promise.all([
    getMeetingNotes(id),
    getTodosByMeetingId(id),
  ]);

  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-3xl mx-auto">
        <SummaryClient meeting={meeting} notes={notes} meetingTodos={meetingTodos} />
      </div>
    </div>
  );
}
