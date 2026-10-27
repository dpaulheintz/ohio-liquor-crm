import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { findJob } from '@/lib/payroll/engine';
import { JobsClient } from './jobs-client';

export const dynamic = 'force-dynamic';

export default async function PayrollJobsPage() {
  const { supabase } = await requirePayroll();
  const config = await loadConfig(supabase);
  const { data: used } = await supabase.from('payroll_run_lines').select('location_id, job_title').not('job_title', 'is', null);
  const seen = new Map<string, { location_id: string | null; job_title: string }>();
  for (const u of used ?? []) {
    if (!findJob(config.jobs, u.location_id, u.job_title)) seen.set(`${u.location_id}|${u.job_title!.toLowerCase()}`, { location_id: u.location_id, job_title: u.job_title! });
  }
  return <JobsClient jobs={config.jobs} locations={config.locations} unmapped={[...seen.values()]} />;
}
