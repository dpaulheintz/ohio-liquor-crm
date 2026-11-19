import { Download } from 'lucide-react';
import { getFinData } from '@/lib/fin/page-data';
import { UploadClient } from '@/components/accounting/upload-client';
import { periodLabel } from '@/lib/fin/shared';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const d = await getFinData();
  const accounts = d.accounts.map((a) => ({ gl: a.gl_number, name: a.name, section: a.section }));
  const history = d.uploads.slice(0, 40);

  return (
    <div className="space-y-6">
      <UploadClient accounts={accounts} />

      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-3 py-2 text-sm font-semibold">Upload history</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-left">Version</th><th className="px-3 py-2 text-left">File</th>
                <th className="px-3 py-2 text-left">Changes</th><th className="px-3 py-2 text-left">By</th><th className="px-3 py-2 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((u) => (
                <tr key={u.id} className="border-t border-muted/60">
                  <td className="px-3 py-1.5">{periodLabel(u.period)}</td>
                  <td className="px-3 py-1.5">v{u.version} {u.status === 'current' ? <span className="ml-1 rounded-full bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-800">current</span> : <span className="text-xs text-muted-foreground">superseded</span>}</td>
                  <td className="max-w-[260px] truncate px-3 py-1.5" title={u.file_name ?? ''}>
                    {u.source === 'history' ? <span className="text-muted-foreground">history load{u.sheet_name ? ` › ${u.sheet_name}` : ''}</span> : <>{u.file_name}{u.sheet_name ? ` › ${u.sheet_name}` : ''}</>}
                    {u.file_path && <a className="ml-2 inline-flex items-center text-primary" href={`/api/accounting/uploads/${u.id}`} aria-label="Download file"><Download className="h-3.5 w-3.5" /></a>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {u.diff ? `${u.diff.changed.length} changed · ${u.diff.added.length} added · ${u.diff.removed.length} removed` : 'first version'}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{u.uploaded_by_name ?? ''}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{new Date(u.uploaded_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
