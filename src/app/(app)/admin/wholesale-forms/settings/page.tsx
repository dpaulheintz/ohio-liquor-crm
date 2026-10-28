import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWholesaleAccess, loadEmailRecipients, loadWarehouses } from '@/lib/wholesale-forms-server';
import { WHOLESALE_FORMS_PATH } from '@/lib/wholesale-forms';
import { SettingsClient } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function WholesaleSettingsPage() {
  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.isAdmin) redirect(WHOLESALE_FORMS_PATH);
  const [warehouses, recipients] = await Promise.all([loadWarehouses(supabase), loadEmailRecipients(supabase)]);
  return <SettingsClient warehouses={warehouses} recipients={recipients} />;
}
