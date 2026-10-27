import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { TemplateClient } from './template-client';

export const dynamic = 'force-dynamic';

export default async function PayrollTemplatePage() {
  const { supabase } = await requirePayroll();
  const { template } = await loadConfig(supabase);
  return <TemplateClient template={template} />;
}
