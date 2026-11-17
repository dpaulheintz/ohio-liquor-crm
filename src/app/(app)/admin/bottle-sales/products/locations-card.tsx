'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateBottleLocation } from '@/app/actions/bottle-sales';
import type { BottleLocation } from '@/lib/bottle-sales';

/** Agency # and GL sales account per location. Editable by admins + accounting; read-only for everyone else. */
export function LocationsCard({ locations, canEdit }: { locations: BottleLocation[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(() => Object.fromEntries(locations.map((l) => [l.code, { agency: l.agency_number ?? '', gl: l.gl_account ?? '' }])));
  const changed = locations.filter((l) => draft[l.code].agency !== (l.agency_number ?? '') || draft[l.code].gl !== (l.gl_account ?? ''));
  const shared = new Set(locations.map((l) => l.gl_account).filter((g, i, a) => g && a.indexOf(g) !== i));

  function save() {
    start(async () => {
      try {
        for (const l of changed) await updateBottleLocation(l.code, draft[l.code].agency, draft[l.code].gl);
        toast.success(`Saved ${changed.length} location${changed.length === 1 ? '' : 's'}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save');
      }
    });
  }

  return (
    <section className="rounded-lg border bg-card" data-locations-card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Locations</h2>
        <span className="text-xs text-muted-foreground">{canEdit ? 'Agency # and GL sales account used on every report and export.' : 'Only admins and accounting can change these.'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-1.5">Location</th><th className="px-3 py-1.5">Agency #</th><th className="px-3 py-1.5">GL sales account</th></tr>
          </thead>
          <tbody className="divide-y">
            {locations.map((l) => (
              <tr key={l.code}>
                <td className="px-3 py-1.5 font-medium">{l.name} <span className="text-xs text-muted-foreground">({l.code})</span></td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <Input aria-label={`${l.name} agency number`} inputMode="numeric" className="h-9 w-28 tabular-nums" value={draft[l.code].agency}
                      onChange={(e) => setDraft({ ...draft, [l.code]: { ...draft[l.code], agency: e.target.value.replace(/\D/g, '').slice(0, 6) } })} />
                  ) : <span className="tabular-nums">{l.agency_number ?? '—'}</span>}
                </td>
                <td className="px-3 py-1.5">
                  {canEdit ? (
                    <Input aria-label={`${l.name} GL sales account`} inputMode="numeric" className="h-9 w-28 tabular-nums" value={draft[l.code].gl}
                      onChange={(e) => setDraft({ ...draft, [l.code]: { ...draft[l.code], gl: e.target.value.replace(/\D/g, '').slice(0, 8) } })} />
                  ) : <span className="tabular-nums">{l.gl_account ?? '—'}</span>}
                  {l.gl_account && shared.has(l.gl_account) && <span className="ml-2 text-xs text-muted-foreground">shared GL</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3 border-t px-3 py-2">
          <Button size="sm" onClick={save} disabled={pending || changed.length === 0}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
          <span className="text-xs text-muted-foreground">Westerville and PO Box 21 share agency 90286 / GL 4322 — that&rsquo;s expected.</span>
        </div>
      )}
    </section>
  );
}
