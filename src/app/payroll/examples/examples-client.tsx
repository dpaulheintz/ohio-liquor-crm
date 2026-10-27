'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FlaskConical, Loader2, Play, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { attachExampleFiles, createExample, deleteExample, runAllExamples, runExample } from '@/app/actions/payroll';
import { sanitizeCsv } from '@/lib/payroll/detect';
import type { PayrollLocation } from '@/lib/payroll/types';
import { displayDate } from '@/lib/payroll/units';
import { cn } from '@/lib/utils';
import { FileDropper, type PreparedFile, type SavedMapping } from '../file-dropper';

interface ExampleItem {
  id: string; name: string; period_start: string; period_end: string; notes: string | null; files: number; expected_name: string | null;
  matchPct: number | null; last_run_at: string | null; counts: { matched: number; mismatched: number; missing: number; extra: number } | null;
}

const pctClass = (p: number | null) => (p == null ? 'text-muted-foreground' : p === 100 ? 'text-green-700' : p >= 90 ? 'text-amber-700' : 'text-red-700');

export function ExamplesClient({ examples, locations, savedMappings }: { examples: ExampleItem[]; locations: PayrollLocation[]; savedMappings: SavedMapping[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [meta, setMeta] = useState({ name: '', periodStart: '', periodEnd: '', notes: '' });
  const [toastFiles, setToastFiles] = useState<PreparedFile[]>([]);
  const [expected, setExpected] = useState<File | null>(null);
  const expRef = useRef<HTMLInputElement>(null);

  const scoreboardPct = examples.filter((e) => e.matchPct != null);
  const avg = scoreboardPct.length ? Math.floor(scoreboardPct.reduce((a, e) => a + e.matchPct! * 100, 0) / scoreboardPct.length) / 100 : null;

  async function create() {
    if (!expected) return toast.error('Add the finished Paycom file.');
    if (!toastFiles.length) return toast.error('Add the Toast files.');
    setBusy('create');
    try {
      const res = await createExample(meta);
      if (!res.ok) throw new Error(res.error);
      const id = res.data.id;
      const sb = createClient();
      const uploaded = [];
      for (const f of toastFiles) {
        const path = `examples/${id}/toast-${crypto.randomUUID()}.csv`;
        const { error } = await sb.storage.from('payroll-uploads').upload(path, new Blob([f.text], { type: 'text/csv' }), { contentType: 'text/csv' });
        if (error) throw new Error(`${f.name}: ${error.message}`);
        uploaded.push({ path, name: f.name, kind: f.kind, locationId: f.locationId, mapping: f.mapping });
      }
      const expText = sanitizeCsv(await expected.text()).text;
      const expPath = `examples/${id}/paycom-${crypto.randomUUID()}.csv`;
      const { error } = await sb.storage.from('payroll-uploads').upload(expPath, new Blob([expText], { type: 'text/csv' }), { contentType: 'text/csv' });
      if (error) throw new Error(`${expected.name}: ${error.message}`);
      const att = await attachExampleFiles(id, { toastFiles: uploaded, expected: { path: expPath, name: expected.name } });
      if (!att.ok) throw new Error(att.error);
      toast.success('Example saved');
      setCreating(false);
      setMeta({ name: '', periodStart: '', periodEnd: '', notes: '' });
      setToastFiles([]);
      setExpected(null);
      router.push(`/payroll/examples/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Couldn’t save the example');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="font-serif text-lg font-semibold flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Training examples</h2>
          <p className="text-sm text-muted-foreground">Each example is a real pay period: the Toast exports plus the Paycom file that was actually used. Goal: 100% match on every example before going live.</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy !== null || examples.length === 0} onClick={async () => {
          setBusy('all');
          const res = await runAllExamples();
          setBusy(null);
          if (!res.ok) return toast.error(res.error);
          const perfect = res.data.filter((r) => r.matchPct === 100).length;
          toast.success(`${perfect} of ${res.data.length} examples match 100%`);
          router.refresh();
        }}>{busy === 'all' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />} Run All Examples</Button>
        {!creating && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1.5" /> New example</Button>}
      </div>

      {creating && (
        <section className="rounded-xl border bg-card p-4 space-y-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="e.g. Pay period Sep 21 – Oct 4" /></div>
            <div className="space-y-1.5"><Label>Period start</Label><Input type="date" value={meta.periodStart} onChange={(e) => setMeta({ ...meta, periodStart: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Period end</Label><Input type="date" value={meta.periodEnd} onChange={(e) => setMeta({ ...meta, periodEnd: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes about hand adjustments</Label><Textarea rows={2} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Toast files</Label>
            {toastFiles.length > 0 && <p className="text-xs text-muted-foreground">{toastFiles.length} file(s) ready: {toastFiles.map((f) => f.name).join(', ')}</p>}
            <FileDropper locations={locations} savedMappings={savedMappings} busy={busy !== null} confirmLabel="Use these Toast files" onConfirm={(fs) => setToastFiles((p) => [...p, ...fs])} />
          </div>
          <div className="space-y-2">
            <Label>Finished Paycom file (CSV)</Label>
            <div className="flex items-center gap-3">
              <input ref={expRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setExpected(e.target.files?.[0] ?? null)} />
              <Button variant="outline" size="sm" onClick={() => expRef.current?.click()}><Upload className="h-4 w-4 mr-1.5" /> Choose file</Button>
              <span className="text-sm text-muted-foreground">{expected?.name ?? 'None chosen'}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy !== null || !meta.name || !meta.periodStart || !meta.periodEnd}>{busy === 'create' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save example</Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card overflow-x-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Scoreboard</h3>
          <span className={cn('text-sm font-semibold', pctClass(avg))}>{avg == null ? 'Not run yet' : `Average match ${avg}%`} · {examples.filter((e) => e.matchPct === 100).length}/{examples.length} at 100%</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-medium px-3 py-2">Example</th><th className="text-left font-medium px-3 py-2">Period</th>
            <th className="text-right font-medium px-3 py-2">Files</th><th className="text-right font-medium px-3 py-2">Matched / Mismatched / Missing / Extra</th>
            <th className="text-right font-medium px-3 py-2">Match</th><th className="px-3 py-2" />
          </tr></thead>
          <tbody className="divide-y">
            {examples.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No examples yet. Add your first real pay period above.</td></tr>}
            {examples.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-medium"><Link href={`/payroll/examples/${e.id}`} className="hover:underline">{e.name}</Link></td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{displayDate(e.period_start)} – {displayDate(e.period_end)}</td>
                <td className="px-3 py-2 text-right">{e.files} + 1</td>
                <td className="px-3 py-2 text-right tabular-nums text-xs">{e.counts ? `${e.counts.matched} / ${e.counts.mismatched} / ${e.counts.missing} / ${e.counts.extra}` : '—'}</td>
                <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', pctClass(e.matchPct))}>{e.matchPct == null ? '—' : `${e.matchPct}%`}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" className="h-8 px-2" disabled={busy !== null} title="Run test" onClick={async () => {
                    setBusy(e.id);
                    const res = await runExample(e.id);
                    setBusy(null);
                    if (!res.ok) return toast.error(res.error);
                    router.push(`/payroll/examples/${e.id}`);
                  }}>{busy === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}</Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-red-700" disabled={busy !== null} title="Delete" onClick={async () => {
                    if (!window.confirm(`Delete example “${e.name}” and its files?`)) return;
                    const res = await deleteExample(e.id);
                    if (!res.ok) toast.error(res.error); else router.refresh();
                  }}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
