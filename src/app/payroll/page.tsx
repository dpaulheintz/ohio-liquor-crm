import Link from 'next/link';
import { Download, FileText, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { loadRuns, requirePayroll } from '@/lib/payroll/server';
import { centsDisplay, displayDate, hoursPlain } from '@/lib/payroll/units';
import type { LocationSummary } from '@/lib/payroll/types';
import { StatusBadge } from './status-badge';

export const dynamic = 'force-dynamic';

export default async function PayrollRunsPage() {
  const { supabase } = await requirePayroll();
  const runs = await loadRuns(supabase);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold">Payroll runs</h2>
        <Button asChild size="sm"><Link href="/payroll/runs/new"><Plus className="h-4 w-4 mr-1.5" /> New Payroll Run</Link></Button>
      </div>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium px-3 py-2.5">Pay period</th>
              <th className="text-left font-medium px-3 py-2.5">Status</th>
              <th className="text-right font-medium px-3 py-2.5">Employees</th>
              <th className="text-right font-medium px-3 py-2.5">REG / OT hrs</th>
              <th className="text-right font-medium px-3 py-2.5">Est. gross</th>
              <th className="text-left font-medium px-3 py-2.5">Approved</th>
              <th className="text-right font-medium px-3 py-2.5">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {runs.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">No payroll runs yet. Start one with “New Payroll Run”.</td></tr>
            )}
            {runs.map((r) => {
              const s = ((r.totals?.summaries ?? []) as LocationSummary[]);
              const sum = (k: keyof LocationSummary) => s.reduce((a, x) => a + (Number(x[k]) || 0), 0);
              return (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link href={`/payroll/runs/${r.id}`} className="font-medium hover:underline">{displayDate(r.period_start)} – {displayDate(r.period_end)}</Link>
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.length ? sum('employees') : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{s.length ? `${hoursPlain(sum('regHh'))} / ${hoursPlain(sum('otHh'))}` : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">{s.length ? centsDisplay(sum('grossCents')) : '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {r.approved_at ? `${r.approved_by_name ?? '—'} · ${new Date(r.approved_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}` : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      {(r.status === 'approved' || r.status === 'exported') && (
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2" title="Download Paycom file">
                          <a href={`/api/payroll/runs/${r.id}/export`}><Download className="h-4 w-4" /></a>
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm" className="h-8 px-2" title="Run summary PDF">
                        <a href={`/api/payroll/runs/${r.id}/summary`}><FileText className="h-4 w-4" /></a>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
