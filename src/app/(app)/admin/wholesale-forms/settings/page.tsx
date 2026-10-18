import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWholesaleAccess, loadSettings } from '@/lib/wholesale-forms-server';
import { WHOLESALE_FORMS_PATH } from '@/lib/wholesale-forms';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function WholesaleSettingsPage() {
  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.isAdmin) redirect(WHOLESALE_FORMS_PATH);
  const settings = await loadSettings(supabase);
  return <SettingsClient settings={settings} />;
}
