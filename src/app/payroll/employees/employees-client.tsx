'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2, Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteEmployee, importRoster, saveEmployee } from '@/app/actions/payroll';
import { detectHeaderRow, isSensitiveHeader, normalizeHeader, readCsv } from '@/lib/payroll/detect';
import { nameKey } from '@/lib/payroll/engine';
import type { PayrollEmployee, PayrollLocation } from '@/lib/payroll/types';
import { EditableTable } from '../editable-table';

interface RosterRow { paycom_employee_code: string; first_name: string | null; last_name: string | null; department_code: string | null; location_code: string | null }

/** Best roster match for a Toast name: exact name tokens, else same last name + first initial. */
function suggest(toastName: string, roster: RosterRow[]): RosterRow | null {
  const key = nameKey(toastName);
  const exact = roster.find((r) => nameKey(`${r.first_name ?? ''} ${r.last_name ?? ''}`) === key);
  if (exact) return exact;
  const tokens = key.split(' ');
  return roster.find((r) => {
    const last = (r.last_name ?? '').toLowerCase();
    const firstInitial = (r.first_name ?? '').toLowerCase()[0];
    return last && tokens.includes(last) && tokens.some((t) => t !== last && t[0] === firstInitial);
  }) ?? null;
}

function splitToastName(name: string): { first: string; last: string } {
  if (name.includes(',')) { const [last, first] = name.split(',').map((s) => s.trim()); return { first: first ?? '', last: last ?? '' }; }
  const p = name.trim().split(/\s+/);
  return { first: p.slice(0, -1).join(' '), last: p.at(-1) ?? '' };
}

export function EmployeesClient({ employees, locations, roster, unmatched }: {
  employees: PayrollEmployee[];
  locations: PayrollLocation[];
  roster: RosterRow[];
  unmatched: { toast_name: string; toast_employee_id: string | null; location_id: string | null }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const usedCodes = new Set(employees.map((e) => e.paycom_employee_code).filter(Boolean));
  const available = roster.filter((r) => !usedCodes.has(r.paycom_employee_code));
  const suggestions = useMemo(() => unmatched.map((u) => ({ ...u, match: suggest(u.toast_name, available) })), [unmatched, available]);
  const [choice, setChoice] = useState<Record<string, string>>({});

  async function onRoster(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const records = readCsv(await file.text());
      const h = detectHeaderRow(records);
      const headers = records[h].map((x) => normalizeHeader(x));
      const find = (...names: string[]) => headers.findIndex((x, i) => !isSensitiveHeader(records[h][i]) && names.includes(x));
      const code = find('employee code', 'employee id', 'ee code', 'emp code', 'employee number', 'code', 'id');
      const first = find('first name', 'first', 'legal first name');
      const last = find('last name', 'last', 'legal last name');
      const full = find('employee name', 'name', 'employee');
      const dept = find('department', 'department code', 'dept', 'home department');
      const loc = find('location', 'location code', 'work location');
      if (code < 0) throw new Error('Couldn’t find an employee code column in that file.');
      const rows = records.slice(h + 1).filter((r) => r[code]?.trim()).map((r) => {
        let f = first >= 0 ? r[first] : '';
        let l = last >= 0 ? r[last] : '';
        if (!f && !l && full >= 0) ({ first: f, last: l } = splitToastName(r[full] ?? ''));
        return { code: r[code], first: f ?? '', last: l ?? '', department: dept >= 0 ? r[dept] ?? '' : '', location: loc >= 0 ? r[loc] ?? '' : '' };
      });
      // Only code / name / department / location ever leave the browser.
      const res = await importRoster(rows);
      if (!res.ok) throw new Error(res.error);
      toast.success(`Imported ${res.data.imported} roster rows`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function mapUnmatched(u: (typeof suggestions)[number]) {
    const code = choice[u.toast_name] ?? u.match?.paycom_employee_code ?? '';
    const r = roster.find((x) => x.paycom_employee_code === code);
    const names = r ? { first: r.first_name ?? '', last: r.last_name ?? '' } : splitToastName(u.toast_name);
    setBusyName(u.toast_name);
    const res = await saveEmployee(null, {
      toast_name: u.toast_name, toast_employee_id: u.toast_employee_id ?? '', paycom_employee_code: code,
      first_name: names.first, last_name: names.last, primary_location_id: u.location_id ?? '', active: true, notes: '',
    });
    setBusyName(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${u.toast_name} mapped${code ? ` to ${code}` : ' (add a Paycom code)'}`);
    router.refresh();
  }

  const locOptions = [{ value: '', label: '—' }, ...locations.map((l) => ({ value: l.id, label: l.name }))];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-medium">Paycom roster</p>
          <p className="text-xs text-muted-foreground">{roster.length} employees imported. Upload a roster CSV to get match suggestions — only code, name, department and location are kept.</p>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onRoster(e.target.files?.[0])} />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />} Import roster CSV
        </Button>
      </section>

      {suggestions.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-serif text-base font-semibold">Unmatched Toast names from runs ({suggestions.length})</h3>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 divide-y">
            {suggestions.map((u) => (
              <div key={u.toast_name} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium flex-1 min-w-[160px]">{u.toast_name}{u.toast_employee_id && <span className="ml-2 font-mono text-xs text-muted-foreground">{u.toast_employee_id}</span>}</span>
                <select value={choice[u.toast_name] ?? u.match?.paycom_employee_code ?? ''} onChange={(e) => setChoice({ ...choice, [u.toast_name]: e.target.value })}
                  className="h-8 rounded-md border bg-white px-2 text-xs min-w-[220px]">
                  <option value="">No Paycom match yet</option>
                  {available.map((r) => <option key={r.paycom_employee_code} value={r.paycom_employee_code}>{r.paycom_employee_code} · {r.last_name}, {r.first_name}{u.match?.paycom_employee_code === r.paycom_employee_code ? ' (suggested)' : ''}</option>)}
                </select>
                <Button size="sm" className="h-8" disabled={busyName !== null} onClick={() => mapUnmatched(u)}>
                  {busyName === u.toast_name ? <Loader2 className="h-4 w-4 animate-spin" /> : (choice[u.toast_name] ?? u.match?.paycom_employee_code) ? <><Check className="h-4 w-4 mr-1" /> Confirm match</> : <><UserPlus className="h-4 w-4 mr-1" /> Add mapping</>}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-serif text-base font-semibold">Employee mappings ({employees.length})</h3>
        <EditableTable
          columns={[
            { key: 'toast_name', label: 'Toast name' },
            { key: 'toast_employee_id', label: 'Toast ID', mono: true },
            { key: 'paycom_employee_code', label: 'Paycom code', mono: true },
            { key: 'first_name', label: 'First' },
            { key: 'last_name', label: 'Last' },
            { key: 'primary_location_id', label: 'Primary location', type: 'select', options: locOptions },
            { key: 'active', label: 'Active', type: 'checkbox', width: '64px' },
            { key: 'notes', label: 'Notes' },
          ]}
          rows={employees.map((e) => ({ ...e, primary_location_id: e.primary_location_id ?? '' }))}
          blank={{ toast_name: '', toast_employee_id: '', paycom_employee_code: '', first_name: '', last_name: '', primary_location_id: '', active: true, notes: '' }}
          onSave={(id, r) => saveEmployee(id, {
            toast_name: String(r.toast_name ?? ''), toast_employee_id: String(r.toast_employee_id ?? ''), paycom_employee_code: String(r.paycom_employee_code ?? ''),
            first_name: String(r.first_name ?? ''), last_name: String(r.last_name ?? ''), primary_location_id: String(r.primary_location_id ?? ''),
            active: !!r.active, notes: String(r.notes ?? ''),
          })}
          onDelete={deleteEmployee}
          addLabel="Add employee mapping"
          emptyText="No employees mapped yet. Unmatched names from runs will appear above."
        />
      </section>
    </div>
  );
}
