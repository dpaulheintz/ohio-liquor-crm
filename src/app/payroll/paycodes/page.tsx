import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { PaycodesClient } from './paycodes-client';

export const dynamic = 'force-dynamic';

export default async function PayrollPaycodesPage() {
  const { supabase } = await requirePayroll();
  const { paycodes } = await loadConfig(supabase);
  return <PaycodesClient paycodes={paycodes} />;
}
