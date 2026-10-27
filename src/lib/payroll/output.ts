// Renders the Paycom import file from pay lines using the configurable output template.
import { findJob } from './engine';
import { centsPlain, formatDate, hoursPlain } from './units';
import type { JobMapping, OutputTemplate, PayLine, Paycode, PayrollEmployee, PayrollLocation } from './types';

export interface OutputContext {
  periodStart: string;
  periodEnd: string;
  employees: PayrollEmployee[];
  locations: PayrollLocation[];
  jobs: JobMapping[];
  paycodes: Paycode[];
  template: OutputTemplate;
}

function splitName(toastName: string): { first: string; last: string } {
  if (toastName.includes(',')) {
    const [last, first] = toastName.split(',').map((s) => s.trim());
    return { first: first ?? '', last: last ?? '' };
  }
  const parts = toastName.trim().split(/\s+/);
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) ?? '' };
}

export function buildOutputRows(lines: PayLine[], ctx: OutputContext): { headers: string[]; rows: string[][] } {
  const t = ctx.template;
  const paycodes = new Map(ctx.paycodes.map((p) => [p.earning_type, p]));
  const sortIndex = (et: string) => paycodes.get(et)?.sort_order ?? 999;

  const usable = lines.filter((l) => l.hoursHh !== 0 || l.amountCents !== 0);
  const records = usable.map((l) => {
    const emp = ctx.employees.find((e) => e.id === l.employeeId);
    const loc = ctx.locations.find((x) => x.id === l.locationId);
    const job = findJob(ctx.jobs, l.locationId, l.jobTitle);
    const pc = paycodes.get(l.earningType);
    const isHours = pc?.kind === 'hours';
    const name = splitName(emp?.toast_name ?? l.toastName);
    const values: Record<string, string> = {
      employee_code: emp?.paycom_employee_code ?? '',
      last_name: emp?.last_name ?? name.last,
      first_name: emp?.first_name ?? name.first,
      earning_code: pc?.paycom_earning_code ?? l.earningType,
      rate: t.include_rate && isHours && l.rateCents ? centsPlain(l.rateCents) : '',
      department: job?.paycom_department_code || loc?.paycom_department_code || '',
      position: job?.paycom_position_code ?? '',
      location: loc?.paycom_location_code ?? '',
      period_start: formatDate(ctx.periodStart, t.date_format),
      period_end: formatDate(ctx.periodEnd, t.date_format),
      toast_name: l.toastName,
      job_title: l.jobTitle ?? '',
      blank: '',
    };
    const key = [l.employeeId ?? `name:${l.toastName}`, ...t.columns.filter((c) => c.source !== 'hours' && c.source !== 'amount').map((c) => values[c.source] ?? '')].join('\u0000');
    return { key, values, isHours, hh: l.hoursHh, cents: l.amountCents, sort: [values.employee_code || `\uffff${l.toastName}`, String(sortIndex(l.earningType)).padStart(4, '0'), values.department, values.location] };
  });

  // Rows identical apart from hours/amount (e.g. a Toast line and its adjustment) are netted into one row.
  const merged = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    const prev = merged.get(r.key);
    if (prev) { prev.hh += r.hh; prev.cents += r.cents; } else merged.set(r.key, { ...r });
  }
  const out = [...merged.values()].filter((r) => r.hh !== 0 || r.cents !== 0);
  for (const r of out) {
    r.values.hours = r.isHours && r.hh ? hoursPlain(r.hh) : '';
    r.values.amount = centsPlain(r.cents);
  }

  out.sort((a, b) => a.sort.join('|').localeCompare(b.sort.join('|')));
  return {
    headers: t.columns.map((c) => c.header),
    rows: out.map((r) => t.columns.map((c) => r.values[c.source] ?? '')),
  };
}

const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export async function toXlsx(headers: string[], rows: string[][]): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Paycom Import');
  ws.addRow(headers);
  // Values stay as text so codes and amounts are written exactly as shown.
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
