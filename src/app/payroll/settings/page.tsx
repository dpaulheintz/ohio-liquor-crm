import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function PayrollSettingsPage() {
  const { supabase } = await requirePayroll();
  const { settings } = await loadConfig(supabase);
  return <SettingsClient settings={settings} />;
}
