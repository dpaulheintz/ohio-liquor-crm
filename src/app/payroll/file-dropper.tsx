'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileSpreadsheet, ShieldCheck, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectLocation, headerSignature, parseToastCsv, sanitizeCsv } from '@/lib/payroll/detect';
import { CANONICAL_FIELDS, FIELD_LABELS, type ColumnMapping, type FileKind, type PayrollLocation } from '@/lib/payroll/types';
import { cn } from '@/lib/utils';

export interface SavedMapping { header_signature: string; file_kind: FileKind; mapping: ColumnMapping }

export interface PreparedFile {
  key: string;
  name: string;
  /** Sensitive columns already removed — this is what gets uploaded. */
  text: string;
  headers: string[];
  kind: FileKind;
  locationId: string | null;
  mapping: ColumnMapping;
  signature: string;
  dropped: string[];
  rows: number;
  hasControl: boolean;
  usedSavedMapping: boolean;
}

export function FileDropper({ locations, savedMappings, busy, confirmLabel, onConfirm, kinds = ['payroll_export', 'time_entries'] }: {
  locations: PayrollLocation[];
  savedMappings: SavedMapping[];
  busy: boolean;
  confirmLabel: string;
  onConfirm: (files: PreparedFile[]) => void;
  kinds?: FileKind[];
}) {
  const [pending, setPending] = useState<PreparedFile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(files: FileList | File[]) {
    const prepared: PreparedFile[] = [];
    for (const file of Array.from(files)) {
      if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') continue;
      const raw = await file.text();
      const { text, dropped } = sanitizeCsv(raw);
      const detected = parseToastCsv(text);
      const signature = headerSignature(detected.headers);
      const saved = savedMappings.find((m) => m.header_signature === signature);
      const parsed = saved ? parseToastCsv(text, { mapping: saved.mapping, kind: saved.file_kind }) : detected;
      prepared.push({
        key: crypto.randomUUID(),
        name: file.name,
        text,
        headers: detected.headers,
        kind: saved?.file_kind ?? detected.kind,
        locationId: detectLocation(detected, file.name, locations),
        mapping: saved?.mapping ?? detected.mapping,
        signature,
        dropped,
        rows: parsed.rows.length,
        hasControl: !!parsed.control,
        usedSavedMapping: !!saved,
      });
    }
    setPending((p) => [...p, ...prepared]);
  }

  const update = (key: string, patch: Partial<PreparedFile>) =>
    setPending((p) => p.map((f) => {
      if (f.key !== key) return f;
      const next = { ...f, ...patch };
      const parsed = parseToastCsv(next.text, { mapping: next.mapping, kind: next.kind });
      return { ...next, rows: parsed.rows.length, hasControl: !!parsed.control };
    }));

  const ready = pending.length > 0 && pending.every((f) => f.mapping.employee_name || (f.mapping.first_name && f.mapping.last_name));

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void add(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn('rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors', dragging ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/40')}
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Drop Toast CSVs here, or click to choose</p>
        <p className="text-xs text-muted-foreground">Payroll Export (one per location) plus optional Time Entries. Several at once is fine.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl border bg-card divide-y">
          {pending.map((f) => (
            <div key={f.key} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium flex-1 min-w-[160px] truncate" title={f.name}>{f.name}</span>
                <select value={f.kind} onChange={(e) => update(f.key, { kind: e.target.value as FileKind })} className="h-8 rounded-md border bg-white px-2 text-xs">
                  {kinds.map((k) => <option key={k} value={k}>{k === 'payroll_export' ? 'Payroll Export' : 'Time Entries'}</option>)}
                </select>
                <select value={f.locationId ?? ''} onChange={(e) => update(f.key, { locationId: e.target.value || null })} className={cn('h-8 rounded-md border bg-white px-2 text-xs', !f.locationId && 'border-red-400')}>
                  <option value="">Choose location…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{f.rows} rows{f.hasControl ? ' · totals row ✓' : ''}</span>
                <button type="button" onClick={() => setPending((p) => p.filter((x) => x.key !== f.key))} className="text-muted-foreground hover:text-foreground" aria-label="Remove"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs pl-7">
                {f.dropped.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-green-800"><ShieldCheck className="h-3.5 w-3.5" /> Removed before upload: {f.dropped.join(', ')}</span>
                )}
                {f.usedSavedMapping && <span className="text-muted-foreground">Using saved column mapping</span>}
                <button type="button" onClick={() => setOpen(open === f.key ? null : f.key)} className="inline-flex items-center gap-1 text-primary">
                  {open === f.key ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Column mapping
                </button>
              </div>
              {open === f.key && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-7">
                  {CANONICAL_FIELDS.map((field) => (
                    <label key={field} className="flex items-center gap-2 text-xs">
                      <span className="w-36 shrink-0 text-muted-foreground">{FIELD_LABELS[field]}</span>
                      <select
                        value={f.mapping[field] ?? ''}
                        onChange={(e) => update(f.key, { mapping: { ...f.mapping, [field]: e.target.value || undefined } })}
                        className="h-7 flex-1 min-w-0 rounded border bg-white px-1"
                      >
                        <option value="">—</option>
                        {f.headers.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="p-3 flex justify-end">
            <Button onClick={() => { onConfirm(pending); setPending([]); }} disabled={!ready || busy}>{confirmLabel}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
