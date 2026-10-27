import { cn } from '@/lib/utils';
import type { RunStatus } from '@/lib/payroll/types';

const STYLES: Record<RunStatus, string> = {
  draft: 'bg-muted text-muted-foreground border',
  in_review: 'bg-amber-50 text-amber-800 border border-amber-200',
  approved: 'bg-green-50 text-green-800 border border-green-200',
  exported: 'bg-blue-50 text-blue-800 border border-blue-200',
};
const LABELS: Record<RunStatus, string> = { draft: 'Draft', in_review: 'In review', approved: 'Approved', exported: 'Exported' };

export function StatusBadge({ status }: { status: RunStatus }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STYLES[status])}>{LABELS[status]}</span>;
}
