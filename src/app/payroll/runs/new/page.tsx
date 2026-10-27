import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { defaultPeriod } from '@/lib/payroll/engine';
import { todayInNewYork } from '@/lib/date-utils';
import { NewRunForm } from './new-run-form';

export const dynamic = 'force-dynamic';

export default async function NewPayrollRunPage() {
  const { supabase } = await requirePayroll();
  const { settings } = await loadConfig(supabase);
  const period = defaultPeriod(settings, todayInNewYork());
  return <NewRunForm defaultStart={period.start} defaultEnd={period.end} frequency={settings.pay_frequency} />;
}
