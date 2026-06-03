import { getSamplePulls } from '@/app/actions/samples';
import { SamplesDashboardClient } from './samples-dashboard-client';
import type { SamplePullRow } from '@/app/actions/samples';

export const metadata = { title: 'Samples Dashboard | High Bank CRM' };

export default async function SamplesPage() {
  let pulls: SamplePullRow[] = [];
  try {
    pulls = await getSamplePulls();
  } catch {
    pulls = [];
  }

  return <SamplesDashboardClient pulls={pulls} />;
}
