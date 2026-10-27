'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveTemplate } from '@/app/actions/payroll';
import { OUTPUT_SOURCES, type OutputSource, type OutputTemplate } from '@/lib/payroll/types';
import { formatDate } from '@/lib/payroll/units';

const SOURCE_LABELS: Record<OutputSource, string> = {
  employee_code: 'Paycom employee code', last_name: 'Last name', first_name: 'First name', earning_code: 'Paycom earning code',
  hours: 'Hours', rate: 'Rate', amount: 'Amount', department: 'Department code', position: 'Position code',
  location: 'Location code', period_start: 'Pay period start', period_end: 'Pay period end', toast_name: 'Toast name',
  job_title: 'Toast job title', blank: '(blank column)',
};

export function TemplateClient({ template }: { template: OutputTemplate }) {
  const router = useRouter();
  const [t, setT] = useState(template);
  const [saving, setSaving] = useState(false);

  const setCol = (i: number, patch: Partial<OutputTemplate['columns'][number]>) => setT({ ...t, columns: t.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const move = (i: number, d: -1 | 1) => {
    const cols = [...t.columns];
    const j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    setT({ ...t, columns: cols });
  };

  async function save() {
    setSaving(true);
    const res = await saveTemplate(t);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Template saved — change logged');
    router.refresh();
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <p className="text-sm text-muted-foreground">The Paycom import layout. Replace the placeholder with Paycom’s real format once confirmed — runs and the Examples harness use whatever is saved here.</p>
      <div className="grid sm:grid-cols-4 gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>File type</Label>
          <select value={t.file_type} onChange={(e) => setT({ ...t, file_type: e.target.value as 'csv' | 'xlsx' })} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
            <option value="csv">CSV</option><option value="xlsx">XLSX</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label>Date format</Label><Input value={t.date_format} onChange={(e) => setT({ ...t, date_format: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">e.g. {formatDate('2026-10-05', /Y/.test(t.date_format) ? t.date_format : 'MM/DD/YYYY')}</p></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-4"><input type="checkbox" checked={t.include_rate} onChange={(e) => setT({ ...t, include_rate: e.target.checked })} className="h-4 w-4 accent-[#C8102E]" /> Include rate on hourly lines</label>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2.5 w-16">#</th><th className="text-left font-medium px-2 py-2.5">Header text</th><th className="text-left font-medium px-2 py-2.5">Source field</th>
            <th className="text-left font-medium px-2 py-2.5">Match key</th><th className="px-2 py-2.5" />
          </tr></thead>
          <tbody className="divide-y">
            {t.columns.map((c, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                  {i + 1}
                  <button type="button" onClick={() => move(i, -1)} className="ml-1 align-middle" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5 inline" /></button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5 inline" /></button>
                </td>
                <td className="px-2 py-1.5"><Input value={c.header} onChange={(e) => {
                  const old = c.header;
                  setT({ ...t, columns: t.columns.map((x, j) => (j === i ? { ...x, header: e.target.value } : x)), key_columns: t.key_columns.map((k) => (k === old ? e.target.value : k)) });
                }} className="h-8 text-xs" /></td>
                <td className="px-2 py-1.5">
                  <select value={c.source} onChange={(e) => setCol(i, { source: e.target.value as OutputSource })} className="h-8 rounded-md border bg-white px-1.5 text-xs w-full">
                    {OUTPUT_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5"><input type="checkbox" checked={t.key_columns.includes(c.header)} aria-label="Use as match key"
                  onChange={(e) => setT({ ...t, key_columns: e.target.checked ? [...t.key_columns, c.header] : t.key_columns.filter((k) => k !== c.header) })} className="h-4 w-4 accent-[#C8102E]" /></td>
                <td className="px-2 py-1.5 text-right"><Button variant="ghost" size="sm" className="h-8 px-2 text-red-700" onClick={() => setT({ ...t, columns: t.columns.filter((_, j) => j !== i), key_columns: t.key_columns.filter((k) => k !== c.header) })}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">“Match key” columns identify the same line when the Examples harness compares our file with a real Paycom file.</p>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={() => setT({ ...t, columns: [...t.columns, { header: 'New Column', source: 'blank' }] })}><Plus className="h-4 w-4 mr-1.5" /> Add column</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save template</Button>
      </div>
    </div>
  );
}
