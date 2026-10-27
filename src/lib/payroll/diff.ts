// Line-by-line diff of a generated Paycom file against the real one (Examples harness).
import { normalizeHeader, readCsv } from './detect';
import { parseCents, parseDate } from './units';

export interface FieldDiff { column: string; expected: string; actual: string }
export interface DiffResult {
  columns: string[];
  keyColumns: string[];
  matched: number;
  mismatched: { key: string; fields: FieldDiff[]; expected: Record<string, string>; actual: Record<string, string> }[];
  missing: Record<string, string>[];
  extra: Record<string, string>[];
  matchPct: number;
  unknownExpectedColumns: string[];
}

/** Normalizes values so "12.5" = "12.50" = "$12.50" and "08/30/2026" = "2026-08-30". */
function norm(v: string): string {
  const s = (v ?? '').trim();
  if (s === '') return '';
  const d = parseDate(s);
  if (d && /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(s)) return d;
  const n = parseCents(s);
  if (!n.invalid && n.value !== null && /^[-($\d.,)\s]+$/.test(s)) return `#${n.value}`;
  return s.toLowerCase();
}

function toRecords(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function diffOutput(actual: { headers: string[]; rows: string[][] }, expectedCsv: string, keyColumns: string[]): DiffResult {
  const exp = readCsv(expectedCsv).filter((r) => r.some((c) => c.trim()));
  const expHeadersRaw = (exp[0] ?? []).map((h) => h.trim());
  // Align expected headers to our template headers (case/punctuation-insensitive).
  const byNorm = new Map(actual.headers.map((h) => [normalizeHeader(h), h]));
  const expHeaders = expHeadersRaw.map((h) => byNorm.get(normalizeHeader(h)) ?? h);
  const unknownExpectedColumns = expHeaders.filter((h) => !actual.headers.includes(h));
  const columns = actual.headers.filter((h) => expHeaders.includes(h));
  const keys = keyColumns.filter((k) => columns.includes(k));

  const expected = toRecords(expHeaders, exp.slice(1));
  const produced = toRecords(actual.headers, actual.rows);

  const keyOf = (r: Record<string, string>) => keys.map((k) => norm(r[k] ?? '')).join(' | ');
  const group = (rs: Record<string, string>[]) => {
    const m = new Map<string, Record<string, string>[]>();
    for (const r of rs) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    return m;
  };
  const expG = group(expected);
  const actG = group(produced);

  let matched = 0;
  const mismatched: DiffResult['mismatched'] = [];
  const missing: Record<string, string>[] = [];
  const extra: Record<string, string>[] = [];

  for (const [k, expRows] of expG) {
    const actRows = [...(actG.get(k) ?? [])];
    for (const e of expRows) {
      if (actRows.length === 0) {
        missing.push(e);
        continue;
      }
      // Pair with the produced row that differs in the fewest fields.
      let bestI = 0;
      let bestDiff: FieldDiff[] = [];
      for (let i = 0; i < actRows.length; i++) {
        const a = actRows[i];
        const d = columns.filter((c) => norm(e[c] ?? '') !== norm(a[c] ?? '')).map((c) => ({ column: c, expected: e[c] ?? '', actual: a[c] ?? '' }));
        if (i === 0 || d.length < bestDiff.length) { bestDiff = d; bestI = i; }
      }
      const a = actRows.splice(bestI, 1)[0];
      if (bestDiff.length === 0) matched++;
      else mismatched.push({ key: k, fields: bestDiff, expected: e, actual: a });
    }
    actG.set(k, actRows);
  }
  for (const rest of actG.values()) extra.push(...rest);

  const total = matched + mismatched.length + missing.length + extra.length;
  return {
    columns, keyColumns: keys, matched, mismatched, missing, extra,
    matchPct: total === 0 ? 100 : Math.floor((matched * 10000) / total) / 100,
    unknownExpectedColumns,
  };
}
