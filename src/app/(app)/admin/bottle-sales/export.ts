// CSV / XLSX writers for the Bottle Sales exports. Money is carried as integer cents and only divided
// by 100 when written, so exported totals match the screen to the cent. csvText() and buildWorkbook()
// have no DOM dependency (a script can check the real output); exportCsv/exportXlsx download them.
import type { Cell, Sheet, Table } from '@/lib/bottle-sales-reports';

export type { Cell, Sheet, Table };

function csvCell(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'object') return (v.usd / 100).toFixed(2);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvText(tables: Table[]): string {
  const out: string[] = [];
  for (const t of tables) out.push(csvCell(t.title), t.header.map(csvCell).join(','), ...t.rows.map((r) => r.map(csvCell).join(',')), '');
  return out.join('\r\n');
}

const isTotal = (v: Cell) => typeof v === 'string' && /^(Total|Grand total)/.test(v);

/** One worksheet per sheet; each sheet's tables are stacked with a blank row between them. */
export async function buildWorkbook(sheets: Sheet[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'High Bank CRM · Bottle Sales';
  const used = new Set<string>();
  sheets.forEach((sheet, i) => {
    let sn = sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet ${i + 1}`;
    while (used.has(sn)) sn = `${sn.slice(0, 28)} ${i}`;
    used.add(sn);
    const ws = wb.addWorksheet(sn);
    const widths: number[] = [];
    sheet.tables.forEach((t, ti) => {
      if (ti > 0) ws.addRow([]);
      ws.addRow([t.title]).font = { bold: true, size: ti === 0 ? 13 : 12 };
      if (t.header.length) {
        const h = ws.addRow(t.header);
        h.font = { bold: true };
        h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE8' } };
        t.header.forEach((x, c) => { widths[c] = Math.max(widths[c] ?? 10, x.length + 2); });
      }
      for (const r of t.rows) {
        const row = ws.addRow(r.map((v) => (v != null && typeof v === 'object' ? v.usd / 100 : v)));
        r.forEach((v, c) => {
          if (v != null && typeof v === 'object') row.getCell(c + 1).numFmt = '"$"#,##0.00';
          if (typeof v === 'string') widths[c] = Math.max(widths[c] ?? 10, Math.min(40, v.length + 2));
        });
        if (isTotal(r[0])) row.font = { bold: true };
      }
    });
    ws.columns.forEach((col, c) => { col.width = widths[c] ?? 12; });
    if (sheet.tables.length === 1) ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
  });
  return wb;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(tables: Table[], name: string) {
  download(new Blob(['﻿' + csvText(tables)], { type: 'text/csv;charset=utf-8' }), name);
}

export async function exportXlsx(sheets: Sheet[], name: string) {
  const buf = await (await buildWorkbook(sheets)).xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
