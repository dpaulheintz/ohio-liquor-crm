import Link from 'next/link';
import { requirePayroll } from '@/lib/payroll/server';

export const dynamic = 'force-dynamic';

function summarize(action: string, entity: string | null, details: Record<string, unknown> | null): string {
  if (!details) return '';
  if (details.reason) return `Reason: ${details.reason}`;
  if (details.note) return `Note: ${details.note}`;
  if (details.from || details.to) return `${details.from} → ${details.to}`;
  if (details.file) return String(details.file);
  if (details.new && details.old) {
    const o = details.old as Record<string, unknown>;
    const n = details.new as Record<string, unknown>;
    const changed = Object.keys(n).filter((k) => !['updated_at', 'updated_by', 'edited_at'].includes(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
    return changed.map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`).join('; ').slice(0, 240);
  }
  if (details.new) return `added ${entity ?? ''}`;
  if (details.old) return `deleted ${entity ?? ''}`;
  return JSON.stringify(details).slice(0, 240);
}

export default async function PayrollAuditPage() {
  const { supabase } = await requirePayroll();
  const { data } = await supabase
    .from('payroll_audit_log')
    .select('id, run_id, action, entity, entity_id, details, created_at, actor:profiles!payroll_audit_log_actor_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(500);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Every upload, edit, approval, export, and settings change. Entries can’t be edited or deleted. Showing the latest 500.</p>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-medium px-3 py-2.5">When</th><th className="text-left font-medium px-3 py-2.5">Who</th>
            <th className="text-left font-medium px-3 py-2.5">Action</th><th className="text-left font-medium px-3 py-2.5">Details</th>
          </tr></thead>
          <tbody className="divide-y">
            {(data ?? []).length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">No activity yet.</td></tr>}
            {(data ?? []).map((e) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const actor = e.actor as any;
              return (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{actor?.full_name || actor?.email || '—'}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className="font-mono">{e.action}</span>{e.entity && <span className="text-muted-foreground"> · {e.entity.replace('payroll_', '')}</span>}
                    {e.run_id && <Link href={`/payroll/runs/${e.run_id}`} className="ml-1 text-primary underline">run</Link>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground break-words max-w-[520px]">{summarize(e.action, e.entity, e.details as Record<string, unknown> | null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
