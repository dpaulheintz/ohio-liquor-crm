import Papa from 'papaparse';
import { parseCents, parseDate, parseHundredthsOfHour } from './units';
import type { CanonicalField, ColumnMapping, FileKind, ParsedFile, PayrollLocation, SourceRow, Totals } from './types';

export const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Columns that must never be stored. Matched before anything else and dropped on import.
const SENSITIVE = [
  /\bssn\b/, /social security/, /\bsin\b/, /tax ?id/, /\bein\b/, /\bitin\b/,
  /bank/, /routing/, /\baba\b/, /direct deposit/, /account (number|no|num)/, /\bacct\b/,
  /address/, /street/, /\bcity\b/, /\bzip\b/, /postal/, /\bstate\b/,
  /birth/, /\bdob\b/, /driver/, /license/, /passport/, /\bphone\b/, /\bemail\b/,
];
export const isSensitiveHeader = (h: string) => SENSITIVE.some((re) => re.test(normalizeHeader(h)));

// Ordered most-specific first; each header is claimed by at most one field.
const KEYWORDS: [CanonicalField, string[]][] = [
  ['cc_tips', ['non cash tips', 'noncash tips', 'credit card tips', 'cc tips', 'card tips', 'credit tips']],
  ['cash_tips', ['declared cash tips', 'cash tips declared', 'declared tips', 'cash tips']],
  ['gratuity', ['auto gratuity', 'gratuity', 'gratuities', 'service charge', 'service charges']],
  ['overtime_pay', ['overtime pay', 'ot pay', 'overtime wages']],
  ['regular_pay', ['regular pay', 'reg pay', 'regular wages']],
  ['overtime_hours', ['overtime hours', 'ot hours', 'overtime hrs', 'ot hrs', 'overtime']],
  ['regular_hours', ['regular hours', 'reg hours', 'regular hrs', 'reg hrs']],
  ['total_hours', ['total hours', 'payable hours', 'hours worked', 'total hrs', 'hours']],
  ['rate', ['hourly rate', 'pay rate', 'wage rate', 'base rate', 'wage', 'rate']],
  ['employee_id', ['employee external id', 'external employee id', 'employee id', 'external id', 'emp id', 'employee number', 'employee guid']],
  ['first_name', ['first name', 'employee first name']],
  ['last_name', ['last name', 'employee last name']],
  ['employee_name', ['employee name', 'employee', 'team member', 'name']],
  ['job_title', ['job title', 'job', 'position', 'role']],
  ['location', ['location name', 'location', 'restaurant', 'store']],
  ['work_date', ['business date', 'in date', 'clock in date', 'shift date', 'date', 'clock in', 'time in']],
];

export function detectHeaderRow(records: string[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(records.length, 15); i++) {
    const score = records[i].filter((c) => KEYWORDS.some(([, kws]) => kws.includes(normalizeHeader(c)))).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const usable = headers.filter((h) => h.trim() && !isSensitiveHeader(h));
  // Pass 1: exact keyword matches; pass 2: header contains a multi-word keyword
  // (single words like "date" or "name" would grab "Pay Period Start Date" / "Location Name").
  for (const exact of [true, false]) {
    for (const [field, kws] of KEYWORDS) {
      if (mapping[field]) continue;
      for (const kw of kws) {
        if (!exact && !kw.includes(' ')) continue;
        const hit = usable.find((h) => !used.has(h) && (exact ? normalizeHeader(h) === kw : normalizeHeader(h).includes(kw)));
        if (hit) {
          mapping[field] = hit;
          used.add(hit);
          break;
        }
      }
    }
  }
  return mapping;
}

export function detectKind(mapping: ColumnMapping): FileKind {
  return mapping.work_date ? 'time_entries' : 'payroll_export';
}

export function headerSignature(headers: string[]): string {
  return headers.map(normalizeHeader).filter(Boolean).sort().join('|');
}

export function readCsv(text: string): string[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  return (res.data as string[][]).map((r) => r.map((c) => (c ?? '').toString()));
}

const TOTAL_ROW = /^(grand\s+)?totals?\b|^report total/i;

/** Parses a Toast export into source rows using a confirmed column mapping. */
export function parseToastCsv(text: string, opts: { mapping?: ColumnMapping; kind?: FileKind } = {}): ParsedFile {
  const records = readCsv(text);
  const headerRowIndex = detectHeaderRow(records);
  const headers = (records[headerRowIndex] ?? []).map((h) => h.trim());
  const mapping = opts.mapping ?? detectMapping(headers);
  const kind = opts.kind ?? detectKind(mapping);
  const dropped = headers.filter((h) => h && isSensitiveHeader(h));
  const idx = (f: CanonicalField) => (mapping[f] && !isSensitiveHeader(mapping[f]!) ? headers.indexOf(mapping[f]!) : -1);
  const col = Object.fromEntries((Object.keys(mapping) as CanonicalField[]).map((f) => [f, idx(f)])) as Record<CanonicalField, number>;
  const get = (r: string[], f: CanonicalField) => (col[f] >= 0 ? (r[col[f]] ?? '').trim() : '');

  const rows: SourceRow[] = [];
  let control: Totals | null = null;
  const locationValues = new Set<string>();

  for (let i = headerRowIndex + 1; i < records.length; i++) {
    const r = records[i];
    if (r.every((c) => !c.trim())) continue;
    let name = get(r, 'employee_name');
    if (!name && (get(r, 'first_name') || get(r, 'last_name'))) name = `${get(r, 'first_name')} ${get(r, 'last_name')}`.trim();

    const issues: string[] = [];
    const num = (f: CanonicalField, parse: typeof parseCents) => {
      const p = parse(get(r, f));
      if (p.invalid) issues.push(`invalid_${f}`);
      if (p.rounded) issues.push(`rounded_${f}`);
      return p.value;
    };
    let regHh = num('regular_hours', parseHundredthsOfHour);
    const otHh = num('overtime_hours', parseHundredthsOfHour) ?? 0;
    const totalHh = num('total_hours', parseHundredthsOfHour);
    if (regHh == null && totalHh != null) regHh = totalHh - otHh;
    const parsed = {
      regHh: regHh ?? 0,
      otHh,
      rateCents: num('rate', parseCents),
      regPayCents: num('regular_pay', parseCents),
      otPayCents: num('overtime_pay', parseCents),
      cctipsCents: num('cc_tips', parseCents) ?? 0,
      cashtipsCents: num('cash_tips', parseCents) ?? 0,
      gratCents: num('gratuity', parseCents) ?? 0,
    };

    const firstCell = r.find((c) => c.trim()) ?? '';
    if (TOTAL_ROW.test(name) || (!name && TOTAL_ROW.test(firstCell))) {
      control = {
        regHh: parsed.regHh, otHh: parsed.otHh,
        regPayCents: parsed.regPayCents ?? 0, otPayCents: parsed.otPayCents ?? 0,
        cctipsCents: parsed.cctipsCents, cashtipsCents: parsed.cashtipsCents, gratCents: parsed.gratCents,
      };
      continue;
    }
    if (!name) continue;

    const loc = get(r, 'location');
    if (loc) locationValues.add(loc);
    const rawDate = get(r, 'work_date');
    const workDate = parseDate(rawDate);
    if (kind === 'time_entries' && !workDate) issues.push('invalid_work_date');

    rows.push({
      rowNumber: i + 1,
      toastName: name.replace(/\s+/g, ' '),
      toastEmployeeId: get(r, 'employee_id') || null,
      jobTitle: get(r, 'job_title') || null,
      locationText: loc || null,
      workDate,
      ...parsed,
      issues,
    });
  }

  return {
    headers, headerRowIndex, kind, mapping, signature: headerSignature(headers), rows, control, dropped,
    locationValues: [...locationValues],
  };
}

/** Removes sensitive columns (SSN, bank, address…) so they are never uploaded or stored. */
export function sanitizeCsv(text: string): { text: string; dropped: string[] } {
  const records = readCsv(text);
  const h = detectHeaderRow(records);
  const headers = records[h] ?? [];
  const dropIdx = headers.map((c, i) => (c.trim() && isSensitiveHeader(c) ? i : -1)).filter((i) => i >= 0);
  if (dropIdx.length === 0) return { text, dropped: [] };
  const kept = records.map((r, i) => (i < h ? r : r.filter((_, j) => !dropIdx.includes(j))));
  return { text: Papa.unparse(kept, { newline: '\r\n' }), dropped: dropIdx.map((i) => headers[i].trim()) };
}

export function hasSensitiveColumns(text: string): boolean {
  const records = readCsv(text);
  return (records[detectHeaderRow(records)] ?? []).some((c) => c.trim() && isSensitiveHeader(c));
}

/** Guesses the location from the file's location column, then its file name. */
export function detectLocation(parsed: Pick<ParsedFile, 'locationValues'>, fileName: string, locations: PayrollLocation[]): string | null {
  const norm = (s: string) => normalizeHeader(s);
  const candidates = [...parsed.locationValues, fileName];
  for (const text of candidates) {
    const t = norm(text);
    const hit = locations.find((l) => [l.toast_location_name, l.name].some((n) => n && t.includes(norm(n))));
    if (hit) return hit.id;
  }
  return null;
}

/** Sum of parsed rows, comparable with a file's control totals. */
export function sumRows(rows: SourceRow[]): Totals {
  return rows.reduce<Totals>((t, r) => ({
    regHh: t.regHh + r.regHh,
    otHh: t.otHh + r.otHh,
    regPayCents: t.regPayCents + (r.regPayCents ?? 0),
    otPayCents: t.otPayCents + (r.otPayCents ?? 0),
    cctipsCents: t.cctipsCents + r.cctipsCents,
    cashtipsCents: t.cashtipsCents + r.cashtipsCents,
    gratCents: t.gratCents + r.gratCents,
  }), { regHh: 0, otHh: 0, regPayCents: 0, otPayCents: 0, cctipsCents: 0, cashtipsCents: 0, gratCents: 0 });
}
