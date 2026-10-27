import { loadConfig, requirePayroll } from '@/lib/payroll/server';
import { matchEmployee } from '@/lib/payroll/engine';
import { EmployeesClient } from './employees-client';

export const dynamic = 'force-dynamic';

export default async function PayrollEmployeesPage() {
  const { supabase } = await requirePayroll();
  const config = await loadConfig(supabase);
  const [{ data: roster }, { data: unmatchedLines }] = await Promise.all([
    supabase.from('payroll_paycom_roster').select('paycom_employee_code, first_name, last_name, department_code, location_code').order('last_name'),
    supabase.from('payroll_run_lines').select('toast_name, toast_employee_id, location_id').is('employee_id', null),
  ]);
  const unmatched = new Map<string, { toast_name: string; toast_employee_id: string | null; location_id: string | null }>();
  for (const l of unmatchedLines ?? []) {
    if (matchEmployee(l.toast_name, l.toast_employee_id, config.employees)) continue;
    unmatched.set(l.toast_employee_id ?? l.toast_name.toLowerCase(), l);
  }
  return <EmployeesClient employees={config.employees} locations={config.locations} roster={roster ?? []} unmatched={[...unmatched.values()]} />;
}
