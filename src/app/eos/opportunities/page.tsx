import { getOpportunities } from '@/lib/eos/opportunities';
import OpportunitiesClient from './opportunities-client';

export const dynamic = 'force-dynamic';

export default async function EosOpportunitiesPage() {
  const opportunities = await getOpportunities();
  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-4xl mx-auto">
        <OpportunitiesClient initialOpportunities={opportunities} />
      </div>
    </div>
  );
}
