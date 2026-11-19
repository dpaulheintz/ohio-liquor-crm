// Accounting: map parsed rows to GL accounts, run the import checks, and build the commit payload.
// The same checks run again inside fin_commit_upload() before anything is written.
import type { ParsedSheet } from './parse';
import {
  SECTION_LABEL, SUBTOTALS, SUBTOTAL_LABEL, aliasKey, centsToDecimal, fmtUsd,
  type FinAccount, type FinAlias, type FinEntity, type Section, type SubtotalName,
} from './shared';

/** What the user chose for a row the export didn't identify. Keyed by aliasKey(row name). */
export type Mapping = { gl: string } | { create: { gl: string; name: string; section: Section } };

export interface UnmappedRow { key: string; label: string; name: string; gl: string | null; section: Section | null; row: number; total: number }

export interface Check { id: string; label: string; pass: boolean; details: string[] }

export interface Analysis {
  sheetName: string;
  periodEnding: string | null;
  columns: { col: number; header: string; entity: string | null }[];
  unknownHeaders: string[];
  unmapped: UnmappedRow[];
  mapped: { key: string; label: string; gl: string; via: 'number' | 'alias' | 'name' | 'user' }[];
  lines: { entity: string; gl: string; cents: number }[];
  totals: { gl: string; cents: number }[];
  subtotals: { entity: string; name: SubtotalName; cents: number }[];
  newAccounts: { gl_number: string; name: string; section: Section }[];
  newAliases: { alias_key: string; alias: string; gl_number: string }[];
  checks: Check[];
  ok: boolean; // every check passed and nothing is unmapped
}

export function analyze(sheet: ParsedSheet, ctx: { entities: FinEntity[]; accounts: FinAccount[]; aliases: FinAlias[]; period: string }, mappings: Record<string, Mapping> = {}): Analysis {
  const accounts = new Map(ctx.accounts.map((a) => [a.gl_number, a]));
  const aliasMap = new Map(ctx.aliases.map((a) => [a.alias_key, a.gl_number]));
  const nameMap = new Map(ctx.accounts.map((a) => [aliasKey(a.name), a.gl_number]));
  const entityCodes = ctx.entities.map((e) => e.code);
  const created = new Map<string, { gl_number: string; name: string; section: Section }>();
  const newAliases: Analysis['newAliases'] = [];
  const unmapped: UnmappedRow[] = [];
  const mapped: Analysis['mapped'] = [];
  const rowGl: (string | null)[] = [];

  const sectionOf = (gl: string): Section | null => accounts.get(gl)?.section ?? created.get(gl)?.section ?? null;

  for (const r of sheet.rows) {
    const key = aliasKey(r.name);
    const total = r.values.TOTAL ?? entityCodes.reduce((s, c) => s + (r.values[c] ?? 0), 0);
    let gl: string | null = null;
    let via: Analysis['mapped'][number]['via'] = 'number';
    if (r.gl && accounts.has(r.gl)) { gl = r.gl; via = 'number'; }
    else if (!r.gl && aliasMap.has(key)) { gl = aliasMap.get(key)!; via = 'alias'; }
    else if (!r.gl && nameMap.has(key)) { gl = nameMap.get(key)!; via = 'name'; }
    const m = mappings[r.gl ? `gl${r.gl}` : key];
    if (!gl && m) {
      if ('gl' in m && accounts.has(m.gl)) { gl = m.gl; via = 'user'; }
      else if ('create' in m) {
        const c = m.create;
        if (/^\d{3,6}$/.test(c.gl) && c.name.trim()) {
          if (!accounts.has(c.gl)) created.set(c.gl, { gl_number: c.gl, name: c.name.trim(), section: c.section });
          gl = c.gl; via = 'user';
        }
      }
      if (gl && !r.gl) newAliases.push({ alias_key: key, alias: r.name, gl_number: gl });
    }
    rowGl.push(gl);
    if (gl) mapped.push({ key, label: r.label, gl, via });
    else unmapped.push({ key: r.gl ? `gl${r.gl}` : key, label: r.label, name: r.name, gl: r.gl, section: r.section, row: r.row, total });
  }

  // Lines (blank cells are "no posting", not zero)
  const lines: Analysis['lines'] = [];
  const totals: Analysis['totals'] = [];
  const checks: Check[] = [];
  const dupes: string[] = [];
  const seen = new Map<string, number>();
  sheet.rows.forEach((r, i) => {
    const gl = rowGl[i];
    if (!gl) return;
    for (const e of entityCodes) {
      const v = r.values[e];
      if (v == null) continue;
      const k = `${e}|${gl}`;
      if (seen.has(k)) dupes.push(`${e} ${gl}: rows ${seen.get(k)} and ${r.row}`);
      seen.set(k, r.row);
      lines.push({ entity: e, gl, cents: v });
    }
    if (r.values.TOTAL != null) totals.push({ gl, cents: r.values.TOTAL });
  });

  // 1. Columns
  const found = new Set(sheet.columns.map((c) => c.entity));
  const missingEntities = ctx.entities.filter((e) => !found.has(e.code)).map((e) => e.name);
  checks.push({
    id: 'columns', label: 'Every location column found (by name, any order)',
    pass: missingEntities.length === 0 && found.has('TOTAL') && sheet.unknownHeaders.length === 0,
    details: [
      `Columns in this file: ${sheet.columns.map((c) => `${c.header} → ${c.entity === 'TOTAL' ? 'Total' : ctx.entities.find((e) => e.code === c.entity)?.name}`).join(' · ')}`,
      ...missingEntities.map((n) => `Missing column: ${n}`),
      ...(found.has('TOTAL') ? [] : ['Missing column: Total']),
      ...sheet.unknownHeaders.map((h) => `Unrecognized column “${h}” — add it as a location alias in Settings`),
    ],
  });

  // 2. Period
  const expectedEnd = (() => { const [y, m] = ctx.period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })();
  checks.push({
    id: 'period', label: 'File is for the month you picked',
    pass: sheet.periodEnding === null || sheet.periodEnding === expectedEnd,
    details: [sheet.periodEnding ? `File says “Period Ending ${sheet.periodEnding}”; you picked the month ending ${expectedEnd}` : 'No “Period Ending” line found; using the month you picked'],
  });

  // 3. Mapping
  checks.push({
    id: 'mapped', label: 'Every account mapped to a GL number', pass: unmapped.length === 0,
    details: unmapped.map((u) => `Row ${u.row}: “${u.label}” isn’t mapped`),
  });

  // 4. Duplicates
  checks.push({ id: 'duplicates', label: 'No duplicate GL rows per location', pass: dupes.length === 0, details: dupes });

  // 5. Subtotals, recalculated from the account lines, per entity, to the cent
  const subtotals: Analysis['subtotals'] = [];
  const subDetails: string[] = [];
  for (const s of sheet.subtotals) if (s.cents != null) subtotals.push({ entity: s.entity, name: s.name, cents: s.cents });
  for (const e of entityCodes) {
    const sec: Record<Section, number> = { sales: 0, discounts: 0, prime: 0, opex: 0, noncontrollable: 0 };
    for (const l of lines) if (l.entity === e) { const s = sectionOf(l.gl); if (s) sec[s] += l.cents; }
    const calc: Record<SubtotalName, number> = {
      gross_sales: sec.sales, total_discounts: sec.discounts, net_sales: sec.sales + sec.discounts,
      total_prime: sec.prime, total_opex: sec.opex, total_noncontrollable: sec.noncontrollable,
      net_profit: sec.sales + sec.discounts - sec.prime - sec.opex - sec.noncontrollable,
    };
    for (const name of SUBTOTALS) {
      const file = sheet.subtotals.find((s) => s.entity === e && s.name === name);
      const fileCents = file?.cents ?? 0;
      if (file && fileCents !== calc[name]) {
        subDetails.push(`${ctx.entities.find((x) => x.code === e)?.name} ${SUBTOTAL_LABEL[name]}: file ${fmtUsd(fileCents)}, recalculated ${fmtUsd(calc[name])} (off by ${fmtUsd(calc[name] - fileCents)}; row ${file.row})`);
      }
    }
  }
  checks.push({ id: 'subtotals', label: 'Recalculated subtotals equal the export’s, to the cent', pass: subDetails.length === 0 && unmapped.length === 0, details: subDetails });

  // 6. Locations add up to Total on every line
  const totalDetails: string[] = [];
  sheet.rows.forEach((r, i) => {
    if (r.values.TOTAL == null) return;
    const sum = entityCodes.reduce((s, e) => s + (r.values[e] ?? 0), 0);
    if (sum !== r.values.TOTAL) totalDetails.push(`Row ${r.row} “${r.label}”${rowGl[i] ? ` (${rowGl[i]})` : ''}: locations ${fmtUsd(sum)}, Total ${fmtUsd(r.values.TOTAL)} (off by ${fmtUsd(sum - r.values.TOTAL)})`);
  });
  for (const s of sheet.subtotals) {
    if (s.entity !== 'TOTAL' || s.cents == null) continue;
    const sum = entityCodes.reduce((acc, e) => acc + (sheet.subtotals.find((x) => x.entity === e && x.name === s.name)?.cents ?? 0), 0);
    if (sum !== s.cents) totalDetails.push(`${SUBTOTAL_LABEL[s.name]} (row ${s.row}): locations ${fmtUsd(sum)}, Total ${fmtUsd(s.cents)} (off by ${fmtUsd(sum - s.cents)})`);
  }
  checks.push({ id: 'totals', label: 'Locations add up to the Total column on every line', pass: totalDetails.length === 0, details: totalDetails });

  const newAccounts = [...created.values()];
  const ok = checks.every((c) => c.pass || c.id === 'period') && checks.find((c) => c.id === 'period')!.pass;
  return {
    sheetName: sheet.sheetName, periodEnding: sheet.periodEnding, columns: sheet.columns, unknownHeaders: sheet.unknownHeaders,
    unmapped, mapped, lines, totals, subtotals, newAccounts, newAliases, checks, ok,
  };
}

/** The JSON fin_commit_upload() takes (money as decimal strings, never floats). */
export function commitPayload(a: Analysis, meta: { period: string; file_path: string | null; file_name: string | null; source: 'upload' | 'history' }) {
  return {
    period: meta.period,
    file_path: meta.file_path,
    file_name: meta.file_name,
    sheet_name: a.sheetName,
    source: meta.source,
    detected_columns: a.columns,
    check_results: a.checks.map((c) => ({ id: c.id, label: c.label, pass: c.pass, details: c.details.slice(0, 20) })),
    // every row's label → GL (lets later months spot renamed accounts)
    mappings: a.mapped.map((m) => ({ label: m.label, gl: m.gl, via: m.via })),
    new_accounts: a.newAccounts,
    new_aliases: a.newAliases,
    lines: a.lines.map((l) => ({ entity_code: l.entity, gl_number: l.gl, amount: centsToDecimal(l.cents) })),
    totals: a.totals.map((t) => ({ gl_number: t.gl, amount: centsToDecimal(t.cents) })),
    subtotals: a.subtotals.map((s) => ({ entity_code: s.entity, name: s.name, amount: centsToDecimal(s.cents) })),
  };
}

export const sectionLabel = (s: Section | null) => (s ? SECTION_LABEL[s] : 'Unknown section');
