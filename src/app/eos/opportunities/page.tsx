import type { Metadata } from 'next';
import { getOpportunities } from '@/lib/eos/opportunities';
import { getActiveMeeting } from '@/lib/eos/meetings';
import OpportunitiesClient from './opportunities-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Opportunities | High Bank EOS' };

export default async function EosOpportunitiesPage() {
  const [opportunities, activeMeeting] = await Promise.all([
    getOpportunities(),
    getActiveMeeting(),
  ]);
  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-4xl mx-auto">
        <OpportunitiesClient
          initialOpportunities={opportunities}
          activeMeetingId={activeMeeting?.id ?? null}
        />
      </div>
    </div>
  );
}
