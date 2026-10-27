'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { runExample } from '@/app/actions/payroll';
import type { DiffResult } from '@/lib/payroll/diff';
import { displayDate } from '@/lib/payroll/units';
import { cn } from '@/lib/utils';

interface Props {
  example: { id: string; name: string; period_start: string; period_end: string; notes: string | null; files: { name: string; kind: string }[]; expected_name: string | null; last_run_at: string | null };
  result: DiffResult | null;
}

function RowsTable({ title, rows, columns, tone }: { title: string; rows: Record<string, string>[]; columns: string[]; tone: string }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h3 className={cn('text-sm font-semibold', tone)}>{title} ({rows.length})</h3>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-muted"><tr>{columns.map((c) => <th key={c} className="text-left px-2 py-1.5 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
          <tbody className="divide-y">{rows.map((r, i) => <tr key={i}>{columns.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{r[c] ?? ''}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function ExampleDetail({ example, result }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const r = result;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <Link href="/payroll/examples" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Examples</Link>
          <h2 className="font-serif text-xl font-semibold">{example.name}</h2>
          <p className="text-xs text-muted-foreground">
            {displayDate(example.period_start)} – {displayDate(example.period_end)} · Toast: {example.files.map((f) => f.name).join(', ')} · Paycom: {example.expected_name}
          </p>
          {example.notes && <p className="text-sm mt-1">{example.notes}</p>}
        </div>
        <Button onClick={async () => {
          setRunning(true);
          const res = await runExample(example.id);
          setRunning(false);
          if (!res.ok) return toast.error(res.error);
          toast.success(`Match ${res.data.matchPct}%`);
          router.refresh();
        }} disabled={running}>{running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />} Run Test</Button>
      </div>

      {!r ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">Not run yet. Run Test pushes the Toast files through the current rules and compares the result with the real Paycom file.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-5">
            {[
              { label: 'Match', value: `${r.matchPct}%`, tone: r.matchPct === 100 ? 'text-green-700' : r.matchPct >= 90 ? 'text-amber-700' : 'text-red-700' },
              { label: 'Matched lines', value: r.matched, tone: 'text-green-700' },
              { label: 'Mismatched', value: r.mismatched.length, tone: r.mismatched.length ? 'text-amber-700' : '' },
              { label: 'Missing (in Paycom, not ours)', value: r.missing.length, tone: r.missing.length ? 'text-red-700' : '' },
              { label: 'Extra (ours, not in Paycom)', value: r.extra.length, tone: r.extra.length ? 'text-red-700' : '' },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</p>
                <p className={cn('text-2xl font-serif font-bold', c.tone)}>{c.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Lines are matched on {r.keyColumns.join(' + ') || '(no key columns)'} · compared columns: {r.columns.join(', ')}
            {r.unknownExpectedColumns.length > 0 && <> · <span className="text-amber-700">Paycom columns not in our template: {r.unknownExpectedColumns.join(', ')}</span></>}
            {example.last_run_at && <> · last run {new Date(example.last_run_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}</>}
          </p>

          {r.mismatched.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-800">Mismatched lines ({r.mismatched.length}) — field by field</h3>
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted"><tr>
                    <th className="text-left px-2 py-1.5 font-semibold">Line</th><th className="text-left px-2 py-1.5 font-semibold">Field</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Paycom (expected)</th><th className="text-left px-2 py-1.5 font-semibold">Ours</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {r.mismatched.flatMap((m, i) => m.fields.map((f, j) => (
                      <tr key={`${i}-${j}`}>
                        {j === 0 && <td rowSpan={m.fields.length} className="px-2 py-1 font-mono align-top">{r.keyColumns.map((k) => m.expected[k]).join(' · ')}</td>}
                        <td className="px-2 py-1">{f.column}</td>
                        <td className="px-2 py-1 font-mono text-green-800">{f.expected || '(blank)'}</td>
                        <td className="px-2 py-1 font-mono text-red-700">{f.actual || '(blank)'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <RowsTable title="Missing lines — in the Paycom file but not produced by our rules" rows={r.missing} columns={r.columns} tone="text-red-700" />
          <RowsTable title="Extra lines — produced by our rules but not in the Paycom file" rows={r.extra} columns={r.columns} tone="text-red-700" />
          {r.matchPct === 100 && <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">Every line matches the real Paycom file.</p>}
        </>
      )}
    </div>
  );
}
