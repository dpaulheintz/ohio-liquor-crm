'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ColumnDef {
  key: string;
  label: string;
  type?: 'text' | 'checkbox' | 'select' | 'number';
  options?: { value: string; label: string }[];
  width?: string;
  placeholder?: string;
  mono?: boolean;
}

type Row = Record<string, string | boolean | number | null>;
type Res = { ok: true; data: unknown } | { ok: false; error: string };

export function EditableTable({ columns, rows, blank, onSave, onDelete, addLabel = 'Add', emptyText = 'Nothing here yet.' }: {
  columns: ColumnDef[];
  rows: { id: string }[];
  blank: Row;
  onSave: (id: string | null, row: Row) => Promise<Res>;
  onDelete?: (id: string) => Promise<Res>;
  addLabel?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Row>>({});
  const [adding, setAdding] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const val = (id: string, row: object, key: string) => (drafts[id]?.[key] !== undefined ? drafts[id][key] : (row as Row)[key]);
  const dirty = (id: string) => !!drafts[id] && Object.keys(drafts[id]).length > 0;
  const set = (id: string, key: string, v: string | boolean | number | null) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: v } }));

  async function save(id: string | null, row: Row) {
    setBusy(id ?? 'new');
    const res = await onSave(id, row);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success('Saved — change logged');
    if (id) setDrafts((d) => { const n = { ...d }; delete n[id]; return n; }); else setAdding(null);
    router.refresh();
  }

  const cell = (c: ColumnDef, value: Row[string], onChange: (v: string | boolean | number | null) => void) => {
    if (c.type === 'checkbox') return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#C8102E]" aria-label={c.label} />;
    if (c.type === 'select') return (
      <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="h-8 rounded-md border bg-white px-1.5 text-xs w-full min-w-[110px]">
        {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
    return <Input value={String(value ?? '')} placeholder={c.placeholder} onChange={(e) => onChange(c.type === 'number' ? Number(e.target.value) : e.target.value)}
      className={cn('h-8 text-xs', c.mono && 'font-mono')} inputMode={c.type === 'number' ? 'numeric' : undefined} />;
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => <th key={c.key} className="text-left font-medium px-2 py-2.5 whitespace-nowrap" style={{ width: c.width }}>{c.label}</th>)}
              <th className="px-2 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && !adding && <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-muted-foreground">{emptyText}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => <td key={c.key} className="px-2 py-1.5">{cell(c, val(r.id, r, c.key), (v) => set(r.id, c.key, v))}</td>)}
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <Button size="sm" variant={dirty(r.id) ? 'default' : 'ghost'} className="h-8 px-2" disabled={!dirty(r.id) || busy !== null}
                    onClick={() => save(r.id, Object.fromEntries(columns.map((c) => [c.key, val(r.id, r, c.key)])))}>
                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                  {onDelete && (
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-red-700" disabled={busy !== null}
                      onClick={async () => { if (!window.confirm('Delete this row?')) return; const res = await onDelete(r.id); if (!res.ok) toast.error(res.error); else { toast.success('Deleted — change logged'); router.refresh(); } }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {adding && (
              <tr className="bg-muted/30">
                {columns.map((c) => <td key={c.key} className="px-2 py-1.5">{cell(c, adding[c.key], (v) => setAdding({ ...adding, [c.key]: v }))}</td>)}
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <Button size="sm" className="h-8" disabled={busy !== null} onClick={() => save(null, adding)}>{busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(null)}>Cancel</Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!adding && <Button variant="outline" size="sm" onClick={() => setAdding({ ...blank })}><Plus className="h-4 w-4 mr-1.5" /> {addLabel}</Button>}
    </div>
  );
}
