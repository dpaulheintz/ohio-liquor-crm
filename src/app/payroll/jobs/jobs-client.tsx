'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteJob, saveJob } from '@/app/actions/payroll';
import type { JobMapping, PayrollLocation } from '@/lib/payroll/types';
import { EditableTable } from '../editable-table';

export function JobsClient({ jobs, locations, unmapped }: { jobs: JobMapping[]; locations: PayrollLocation[]; unmapped: { location_id: string | null; job_title: string }[] }) {
  const router = useRouter();
  const locOptions = [{ value: '', label: 'Any location' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];
  const toInput = (r: Record<string, unknown>) => ({
    location_id: String(r.location_id ?? ''), toast_job_title: String(r.toast_job_title ?? ''), paycom_department_code: String(r.paycom_department_code ?? ''),
    paycom_position_code: String(r.paycom_position_code ?? ''), is_tipped: !!r.is_tipped, notes: String(r.notes ?? ''),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Map each Toast job title (per location, or for any location) to a Paycom department/position. Tipped jobs get the tip-credit check.</p>
      {unmapped.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">Job titles from runs that still need mapping</p>
          <div className="flex flex-wrap gap-2">
            {unmapped.map((u) => (
              <Button key={`${u.location_id}|${u.job_title}`} variant="outline" size="sm" className="h-7 text-xs bg-white"
                onClick={async () => {
                  const res = await saveJob(null, { location_id: '', toast_job_title: u.job_title, paycom_department_code: '', paycom_position_code: '', is_tipped: false, notes: '' });
                  if (!res.ok) toast.error(res.error); else { toast.success(`Added “${u.job_title}” — fill in its Paycom codes`); router.refresh(); }
                }}>
                <Plus className="h-3.5 w-3.5 mr-1" />{u.job_title} <span className="ml-1 text-muted-foreground">({locations.find((l) => l.id === u.location_id)?.name ?? 'any'})</span>
              </Button>
            ))}
          </div>
        </div>
      )}
      <EditableTable
        columns={[
          { key: 'location_id', label: 'Location', type: 'select', options: locOptions, width: '160px' },
          { key: 'toast_job_title', label: 'Toast job title' },
          { key: 'paycom_department_code', label: 'Paycom department', mono: true },
          { key: 'paycom_position_code', label: 'Paycom position', mono: true },
          { key: 'is_tipped', label: 'Tipped', type: 'checkbox', width: '70px' },
          { key: 'notes', label: 'Notes' },
        ]}
        rows={jobs.map((j) => ({ ...j, location_id: j.location_id ?? '' }))}
        blank={{ location_id: '', toast_job_title: '', paycom_department_code: '', paycom_position_code: '', is_tipped: false, notes: '' }}
        onSave={(id, row) => saveJob(id, toInput(row))}
        onDelete={deleteJob}
        addLabel="Add job mapping"
        emptyText="No job mappings yet."
      />
    </div>
  );
}
