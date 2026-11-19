// Accounting: read a "Profit & Loss - Location Side by Side" export.
// Columns are found by entity name (any order, "7 - " prefixes stripped), rows by account number or,
// when the export has none, by account name. Never by position. The % columns are ignored, and the
// unlabeled running-subtotal row ("0" / "0.00") after the discounts is skipped.
import ExcelJS from 'exceljs';
import { aliasKey, entityKey, toCents, type FinEntity, type Section, type SubtotalName } from './shared';

export interface ParsedColumn { col: number; header: string; entity: string | null }

export interface ParsedRow {
  row: number;            // spreadsheet row number (for messages)
  label: string;          // as written, e.g. "4100 - Food Sales" or "Food Sales"
  gl: string | null;      // account number when the label has one
  name: string;           // label without the number
  section: Section | null; // section header it sits under in this file
  values: Record<string, number | null>; // entity code (and 'TOTAL') → cents; null = blank cell
}

export interface ParsedSheet {
  sheetName: string;
  periodEnding: string | null;  // "2026-10-31" from "Period Ending 10/31/2026"
  headerRow: number;
  columns: ParsedColumn[];       // value columns in the file's order (one per entity + Total)
  unknownHeaders: string[];      // headers that look like a location but match no entity
  rows: ParsedRow[];
  subtotals: { entity: string; name: SubtotalName; cents: number | null; row: number }[];
}

const SECTION_HEADERS: Record<string, Section> = {
  sales: 'sales', discounts: 'discounts', primecost: 'prime',
  operatingexpense: 'opex', operatingexpenses: 'opex',
  noncontrollableexpense: 'noncontrollable', noncontrollableexpenses: 'noncontrollable', noncontrollable: 'noncontrollable',
};
const SUBTOTAL_ROWS: Record<string, SubtotalName> = {
  grosssales: 'gross_sales', totaldiscounts: 'total_discounts', netsales: 'net_sales', totalprimecost: 'total_prime',
  totaloperatingexpense: 'total_opex', totaloperatingexpenses: 'total_opex',
  totalnoncontrollableexpense: 'total_noncontrollable', totalnoncontrollableexpenses: 'total_noncontrollable', netprofit: 'net_profit',
};

type CellValue = ExcelJS.CellValue;
function cellText(v: CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result == null ? '' : String(v.result);
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v);
}
function cellNumber(v: CellValue): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'result' in v) return typeof v.result === 'number' ? v.result : v.result == null ? null : Number(v.result);
  const s = cellText(v).trim().replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function loadWorkbook(data: ArrayBuffer | Buffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Buffer/ArrayBuffer; normalise Uint8Array views
  const buf = data instanceof ArrayBuffer ? data : (data as Uint8Array).buffer.slice((data as Uint8Array).byteOffset, (data as Uint8Array).byteOffset + (data as Uint8Array).byteLength);
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}

/** Sheets that look like a P&L export (have an entity header row). */
export function pnlSheets(wb: ExcelJS.Workbook, entities: FinEntity[]): string[] {
  return wb.worksheets.filter((ws) => findHeader(ws, entities) !== null).map((ws) => ws.name);
}

function entityMatcher(entities: FinEntity[]) {
  const map = new Map<string, string>();
  for (const e of entities) {
    map.set(entityKey(e.name), e.code);
    for (const a of e.aliases) map.set(entityKey(a), e.code);
  }
  map.set('total', 'TOTAL');
  return (header: string) => map.get(entityKey(header)) ?? null;
}

function findHeader(ws: ExcelJS.Worksheet, entities: FinEntity[]): { row: number; columns: ParsedColumn[]; unknown: string[] } | null {
  const match = entityMatcher(entities);
  const limit = Math.min(ws.rowCount, 20);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    const seen = new Map<string, ParsedColumn>();
    const unknown: string[] = [];
    let hits = 0;
    row.eachCell((cell, col) => {
      if (col === 1) return;
      const text = cellText(cell.value).trim();
      if (!text) return;
      const code = match(text);
      if (code) {
        hits++;
        if (!seen.has(code)) seen.set(code, { col, header: text, entity: code }); // first column = value, the repeat is its %
      } else if (/^\d+\s*-\s*\S/.test(text) || /^[A-Za-z]/.test(text)) {
        unknown.push(text);
      }
    });
    if (seen.size >= 2 && hits >= 2) {
      const columns = [...seen.values()].sort((a, b) => a.col - b.col);
      return { row: r, columns, unknown: [...new Set(unknown)].filter((u) => !/profit\s*&\s*loss|period ending/i.test(u)) };
    }
  }
  return null;
}

export function parseSheet(ws: ExcelJS.Worksheet, entities: FinEntity[]): ParsedSheet {
  const header = findHeader(ws, entities);
  if (!header) throw new Error(`“${ws.name}” doesn’t look like a P&L export: no row with the location names (${entities.map((e) => e.aliases[0] ?? e.name).join(', ')}).`);

  let periodEnding: string | null = null;
  for (let r = 1; r < header.row && !periodEnding; r++) {
    ws.getRow(r).eachCell((cell) => {
      const m = cellText(cell.value).match(/Period Ending\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if (m && !periodEnding) periodEnding = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    });
  }

  const rows: ParsedRow[] = [];
  const subtotals: ParsedSheet['subtotals'] = [];
  let section: Section | null = null;

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const raw = row.getCell(1).value;
    const label = cellText(raw).trim();
    if (!label) continue;
    const key = aliasKey(label);
    if (SECTION_HEADERS[key] && header.columns.every((c) => cellNumber(row.getCell(c.col).value) === null)) {
      section = SECTION_HEADERS[key];
      continue;
    }
    // the unlabeled running subtotal after the discounts shows its label as 0 / 0.00
    if (typeof raw === 'number' || /^-?\d+(\.\d+)?$/.test(label)) continue;

    const values: Record<string, number | null> = {};
    for (const c of header.columns) {
      const n = cellNumber(row.getCell(c.col).value);
      values[c.entity!] = n === null ? null : toCents(n);
    }

    if (SUBTOTAL_ROWS[key]) {
      for (const c of header.columns) subtotals.push({ entity: c.entity!, name: SUBTOTAL_ROWS[key], cents: values[c.entity!], row: r });
      continue;
    }

    const m = label.match(/^(\d{3,6})\s*-\s*(.+)$/);
    rows.push({ row: r, label, gl: m ? m[1] : null, name: (m ? m[2] : label).trim(), section, values });
  }

  return {
    sheetName: ws.name, periodEnding, headerRow: header.row, columns: header.columns, unknownHeaders: header.unknown, rows, subtotals,
  };
}

/** Parse one sheet (by name), or the only P&L sheet in the workbook. */
export async function parseWorkbook(data: ArrayBuffer | Buffer | Uint8Array, entities: FinEntity[], sheetName?: string): Promise<{ sheet: ParsedSheet; sheets: string[] }> {
  const wb = await loadWorkbook(data);
  const sheets = pnlSheets(wb, entities);
  if (!sheets.length) throw new Error('No P&L sheet found in this file (no row with the location names).');
  const name = sheetName ?? (sheets.length === 1 ? sheets[0] : null);
  if (!name) throw new Error(`This file has ${sheets.length} P&L sheets — pick one: ${sheets.join(', ')}`);
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Sheet “${name}” not found.`);
  return { sheet: parseSheet(ws, entities), sheets };
}

/** A one-sheet copy of a workbook tab (values only), for storing a single month's export. */
export async function extractSheet(data: ArrayBuffer | Buffer | Uint8Array, sheetName: string): Promise<Buffer> {
  const wb = await loadWorkbook(data);
  const src = wb.getWorksheet(sheetName);
  if (!src) throw new Error(`Sheet “${sheetName}” not found.`);
  const out = new ExcelJS.Workbook();
  const ws = out.addWorksheet(sheetName.slice(0, 31));
  src.eachRow({ includeEmpty: true }, (row, r) => {
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const v = cell.value;
      ws.getCell(r, c).value = v != null && typeof v === 'object' && 'result' in v ? (v.result as ExcelJS.CellValue) ?? null : v;
    });
  });
  return Buffer.from(await out.xlsx.writeBuffer());
}
