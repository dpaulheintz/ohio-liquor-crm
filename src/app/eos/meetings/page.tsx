import { getMeetings } from '@/lib/eos/meetings';
import MeetingsClient from './meetings-client';

export const dynamic = 'force-dynamic';

export default async function EosMeetingsPage() {
  const meetings = await getMeetings();
  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-5xl mx-auto">
        <MeetingsClient initialMeetings={meetings} />
      </div>
    </div>
  );
}
