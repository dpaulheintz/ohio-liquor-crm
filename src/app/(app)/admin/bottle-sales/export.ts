// Client-side CSV / XLSX export for the Bottle Sales dashboard. Money is carried as integer cents and
// only divided by 100 when written, so exported totals match the screen to the cent.

export type Cell = string | number | { usd: number } | null; // { usd: cents }
export interface Table { title: string; header: string[]; rows: Cell[][] }

function csvCell(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'object') return (v.usd / 100).toFixed(2);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // no formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportCsv(tables: Table[], name: string) {
  const out: string[] = [];
  for (const t of tables) {
    out.push(csvCell(t.title), t.header.map(csvCell).join(','), ...t.rows.map((r) => r.map(csvCell).join(',')), '');
  }
  download(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' }), name);
}

export async function exportXlsx(tables: Table[], name: string, sheetNames?: string[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'High Bank CRM · Bottle Sales';
  const used = new Set<string>();
  tables.forEach((t, i) => {
    let sn = (sheetNames?.[i] ?? t.title).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet ${i + 1}`;
    while (used.has(sn)) sn = `${sn.slice(0, 28)} ${i}`;
    used.add(sn);
    const ws = wb.addWorksheet(sn);
    ws.addRow([t.title]).font = { bold: true, size: 13 };
    const h = ws.addRow(t.header);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEDE8' } };
    for (const r of t.rows) {
      const row = ws.addRow(r.map((v) => (v != null && typeof v === 'object' ? v.usd / 100 : v)));
      r.forEach((v, c) => { if (v != null && typeof v === 'object') row.getCell(c + 1).numFmt = '"$"#,##0.00'; });
      if (typeof r[0] === 'string' && /^Total/.test(r[0])) row.font = { bold: true };
    }
    ws.columns.forEach((col, c) => { col.width = c === 0 ? 34 : Math.max(10, (t.header[c] ?? '').length + 2); });
    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
  });
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
