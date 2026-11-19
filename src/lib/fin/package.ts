// Accounting: the month-end package (PDF + XLSX). Same numbers as the screens: everything comes from
// buildStatement/totals on the stored lines, in integer cents.
import { TOTAL, indexLines, primePct, scopeMonths, totals } from './compute';
import { buildStatement, type StatementRow } from './statement';
import { FLAG_TYPE_LABEL } from './flags';
import { addMonths, fmtMoney, fmtPct, fmtUsd, periodLabel } from './shared';
import type { FinPageData } from './page-data';

type Cell = string | number | null;

export interface PackageModel {
  period: string;
  status: 'open' | 'closed' | undefined;
  title: string;
  summary: { head: string[]; rows: Cell[][]; cents: (number | null)[][] };
  sideBySide: { head: string[]; rows: StatementRow[]; cols: string[] };
  locations: { code: string; name: string; rows: StatementRow[]; cols: string[]; head: string[] }[];
  flags: { severity: string; type: string; location: string; account: string; message: string; impact: number | null; status: string; note: string }[];
  checklist: { location: string; account: string; expected: number; posted: string; status: string; note: string }[];
}

export function buildPackage(d: FinPageData, period: string): PackageModel {
  const idx = indexLines(d.lines);
  const accounts = new Map(d.accounts.map((a) => [a.gl_number, a]));
  const entities = d.entities.filter((e) => e.active);
  const status = d.periods.find((p) => p.period === period)?.status;
  const pm = addMonths(period, -1), ly = addMonths(period, -12);
  const ytd = scopeMonths(period, 'ytd');
  const names = Object.fromEntries(entities.map((e) => [e.code, e.name]));

  const summaryRows: Cell[][] = [];
  const summaryCents: (number | null)[][] = [];
  for (const e of [...entities.map((x) => ({ code: x.code, name: x.name })), { code: TOTAL, name: 'Company total' }]) {
    const t = totals(idx, accounts, [period], e.code), tp = totals(idx, accounts, [pm], e.code), tl = totals(idx, accounts, [ly], e.code), ty = totals(idx, accounts, ytd, e.code);
    const c = [t?.net ?? null, t && tp ? t.net - tp.net : null, t && tl ? t.net - tl.net : null, t?.profit ?? null, t && tp ? t.profit - tp.profit : null, t && tl ? t.profit - tl.profit : null, ty?.profit ?? null];
    summaryCents.push(c);
    summaryRows.push([e.name, fmtMoney(c[0]), signedMoney(c[1]), signedMoney(c[2]), fmtPct(primePct(t)), fmtMoney(c[3]), signedMoney(c[4]), signedMoney(c[5]), fmtMoney(c[6])]);
  }

  const sbsCols = [...entities.map((e) => e.code), TOTAL];
  const sbsRows = buildStatement(idx, d.accounts, sbsCols.map((c) => ({ key: c, entity: c, months: [period] })));

  const locCols = ['m', 'pm', 'ly', 'ytd'];
  const locations = entities.map((e) => ({
    code: e.code, name: e.name, cols: locCols,
    head: ['Account', periodLabel(period), '% sales', periodLabel(pm), 'Δ', periodLabel(ly), 'Δ', `YTD ${period.slice(0, 4)}`],
    rows: buildStatement(idx, d.accounts, [
      { key: 'm', entity: e.code, months: [period] }, { key: 'pm', entity: e.code, months: [pm] },
      { key: 'ly', entity: e.code, months: [ly] }, { key: 'ytd', entity: e.code, months: ytd },
    ]),
  }));

  const sev = { high: 0, medium: 1, info: 2 } as const;
  const flags = d.flags.filter((f) => f.period === period)
    .sort((a, b) => sev[a.severity] - sev[b.severity] || Math.abs(b.impact ?? 0) - Math.abs(a.impact ?? 0))
    .map((f) => ({
      severity: f.severity, type: FLAG_TYPE_LABEL[f.type] ?? f.type, location: f.entity_code ? names[f.entity_code] ?? f.entity_code : 'Company',
      account: f.gl_number ? `${f.gl_number} ${accounts.get(f.gl_number)?.name ?? ''}` : '', message: f.message, impact: f.impact, status: f.status, note: f.note ?? '',
    }));

  const checklist = d.checklist.filter((c) => c.period === period).map((c) => ({
    location: names[c.entity_code] ?? c.entity_code, account: `${c.gl_number} ${accounts.get(c.gl_number)?.name ?? ''}`, expected: c.expected,
    posted: `${c.months_posted}/${c.window_months}`, status: c.status === 'not_needed' ? 'Not needed' : c.status === 'posted' ? 'Posted' : 'Missing', note: c.note ?? '',
  }));

  return {
    period, status,
    title: `High Bank — Month-End Package — ${periodLabel(period, 'long')}${status === 'open' ? ' (OPEN — not final)' : ''}`,
    summary: { head: ['Location', 'Net Sales', 'vs prior mo', 'vs last yr', 'Prime %', 'Net Profit', 'vs prior mo', 'vs last yr', 'YTD Net Profit'], rows: summaryRows, cents: summaryCents },
    sideBySide: { head: ['Account', ...entities.map((e) => e.name), 'Total'], rows: sbsRows, cols: sbsCols },
    locations, flags, checklist,
  };
}

const signedMoney = (c: number | null) => (c === null ? '' : c > 0 ? `+${fmtMoney(c)}` : fmtMoney(c));

function locRow(r: StatementRow, net: number | null): Cell[] {
  const v = r.values, d1 = v.m !== null && v.pm !== null ? v.m - v.pm : null, d2 = v.m !== null && v.ly !== null ? v.m - v.ly : null;
  return [r.label, fmtMoney(v.m), v.m !== null && net ? fmtPct(v.m / net) : '', fmtMoney(v.pm), signedMoney(d1), fmtMoney(v.ly), signedMoney(d2), fmtMoney(v.ytd)];
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export async function packagePdf(p: PackageModel): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  const heading = (text: string, y = 40) => { doc.setFontSize(14); doc.setTextColor(30, 30, 30); doc.text(text, 36, y); };
  const styles = { fontSize: 7.5, cellPadding: 2.5 } as const;
  const headStyles = { fillColor: [40, 40, 40] as [number, number, number], textColor: 255, fontSize: 7.5 };
  const boldRow = (rows: StatementRow[]) => (i: number) => rows[i] && rows[i].kind !== 'account';

  doc.setFontSize(16); doc.text(p.title, 36, 40);
  doc.setFontSize(8); doc.setTextColor(120, 120, 120); doc.text(`Generated ${generated} · Confidential — accounting use only`, 36, 54);
  if (p.status === 'open') { doc.setTextColor(180, 90, 0); doc.setFontSize(10); doc.text('OPEN MONTH — numbers can still change.', 36, 70); }
  autoTable(doc, { startY: 80, head: [p.summary.head], body: p.summary.rows as string[][], styles, headStyles, columnStyles: Object.fromEntries(p.summary.head.map((_, i) => [i, { halign: i ? 'right' : 'left' }])) });

  doc.addPage(); heading(`P&L side by side — ${periodLabel(p.period, 'long')}`);
  autoTable(doc, {
    startY: 50, head: [p.sideBySide.head], styles: { ...styles, fontSize: 7 }, headStyles,
    body: p.sideBySide.rows.map((r) => r.kind === 'section' ? [r.label.toUpperCase(), ...p.sideBySide.cols.map(() => '')] : [r.label, ...p.sideBySide.cols.map((c) => fmtMoney(r.values[c]))]),
    columnStyles: Object.fromEntries(p.sideBySide.head.map((_, i) => [i, { halign: i ? 'right' : 'left', cellWidth: i ? 'auto' : 170 }])),
    didParseCell: (h) => { if (h.section === 'body' && boldRow(p.sideBySide.rows)(h.row.index)) h.cell.styles.fontStyle = 'bold'; },
  });

  for (const l of p.locations) {
    doc.addPage(); heading(`${l.name} — ${periodLabel(p.period, 'long')}`);
    const net = l.rows.find((r) => r.key === 'net')?.values.m ?? null;
    autoTable(doc, {
      startY: 50, head: [l.head], styles, headStyles,
      body: l.rows.map((r) => r.kind === 'section' ? [r.label.toUpperCase(), '', '', '', '', '', '', ''] : (locRow(r, net) as string[])),
      columnStyles: Object.fromEntries(l.head.map((_, i) => [i, { halign: i ? 'right' : 'left', cellWidth: i ? 'auto' : 200 }])),
      didParseCell: (h) => { if (h.section === 'body' && boldRow(l.rows)(h.row.index)) h.cell.styles.fontStyle = 'bold'; },
    });
  }

  doc.addPage(); heading(`Flags — ${periodLabel(p.period, 'long')} (${p.flags.length})`);
  autoTable(doc, {
    startY: 50, head: [['Severity', 'Type', 'Location', 'Account', 'Flag', 'Impact', 'Status / note']], styles, headStyles,
    body: p.flags.map((f) => [f.severity.toUpperCase(), f.type, f.location, f.account, f.message, f.impact === null ? '' : fmtUsd(f.impact, { whole: true, sign: true }), f.note ? `${f.status}: ${f.note}` : f.status]),
    columnStyles: { 4: { cellWidth: 300 }, 5: { halign: 'right' } },
  });

  doc.addPage(); heading(`Close checklist — ${periodLabel(p.period, 'long')}`);
  if (p.checklist.length) autoTable(doc, {
    startY: 50, head: [['Location', 'Account', 'Expected (median)', 'Posted in', 'Status', 'Note']], styles, headStyles,
    body: p.checklist.map((c) => [c.location, c.account, fmtUsd(c.expected, { whole: true }), c.posted, c.status, c.note]),
    columnStyles: { 2: { halign: 'right' } },
  });
  else { doc.setFontSize(10); doc.text(p.status === 'closed' ? 'Month is closed.' : 'Nothing expected is missing.', 36, 70); }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140, 140, 140); doc.text(`${p.title} · page ${i} of ${pages}`, W - 36, doc.internal.pageSize.getHeight() - 18, { align: 'right' }); }
  return new Uint8Array(doc.output('arraybuffer'));
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

export async function packageXlsx(p: PackageModel): Promise<Uint8Array> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'High Bank CRM';
  const MONEY = '#,##0.00;(#,##0.00);"–"';
  const n = (c: number | null) => (c === null ? null : c / 100);
  const header = (ws: import('exceljs').Worksheet, title: string) => {
    ws.addRow([title]).font = { bold: true, size: 13 };
    if (p.status === 'open') ws.addRow(['OPEN MONTH — numbers can still change.']).font = { bold: true, color: { argb: 'FFB45A00' } };
    ws.addRow([]);
  };
  const statementSheet = (name: string, title: string, head: string[], rows: StatementRow[], cols: string[], extra?: (r: StatementRow) => (number | string | null)[]) => {
    const ws = wb.addWorksheet(name.slice(0, 31));
    header(ws, title);
    const h = ws.addRow(head); h.font = { bold: true };
    for (const r of rows) {
      if (r.kind === 'section') { ws.addRow([r.label.toUpperCase()]).font = { bold: true, color: { argb: 'FF666666' } }; continue; }
      const row = ws.addRow([r.label, ...(extra ? extra(r) : cols.map((c) => n(r.values[c])))]);
      if (r.kind !== 'account') row.font = { bold: true };
    }
    ws.getColumn(1).width = 42;
    for (let i = 2; i <= head.length; i++) { ws.getColumn(i).width = 15; ws.getColumn(i).numFmt = MONEY; }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: h.number }];
    return ws;
  };

  const s = wb.addWorksheet('Summary');
  header(s, p.title);
  s.addRow(p.summary.head).font = { bold: true };
  p.summary.rows.forEach((r, i) => {
    const c = p.summary.cents[i];
    const row = s.addRow([r[0], n(c[0]), n(c[1]), n(c[2]), r[4], n(c[3]), n(c[4]), n(c[5]), n(c[6])]);
    if (i === p.summary.rows.length - 1) row.font = { bold: true };
  });
  s.getColumn(1).width = 26;
  for (let i = 2; i <= 9; i++) { s.getColumn(i).width = 15; if (i !== 5) s.getColumn(i).numFmt = MONEY; }

  statementSheet('P&L side by side', `P&L side by side — ${periodLabel(p.period, 'long')}`, p.sideBySide.head, p.sideBySide.rows, p.sideBySide.cols);
  for (const l of p.locations) {
    const net = l.rows.find((r) => r.key === 'net')?.values.m ?? null;
    const ws = statementSheet(l.name, `${l.name} — ${periodLabel(p.period, 'long')}`, l.head, l.rows, l.cols, (r) => {
      const v = r.values;
      return [n(v.m), v.m !== null && net ? Math.round((v.m / net) * 10000) / 10000 : null, n(v.pm), v.m !== null && v.pm !== null ? n(v.m - v.pm) : null, n(v.ly), v.m !== null && v.ly !== null ? n(v.m - v.ly) : null, n(v.ytd)];
    });
    ws.getColumn(3).numFmt = '0.0%';
  }

  const f = wb.addWorksheet('Flags');
  header(f, `Flags — ${periodLabel(p.period, 'long')}`);
  f.addRow(['Severity', 'Type', 'Location', 'Account', 'Flag', 'Impact', 'Status', 'Note']).font = { bold: true };
  for (const x of p.flags) f.addRow([x.severity, x.type, x.location, x.account, x.message, n(x.impact), x.status, x.note]);
  [10, 16, 18, 28, 90, 14, 10, 40].forEach((w, i) => (f.getColumn(i + 1).width = w));
  f.getColumn(6).numFmt = MONEY;

  const c = wb.addWorksheet('Close checklist');
  header(c, `Close checklist — ${periodLabel(p.period, 'long')}`);
  c.addRow(['Location', 'Account', 'Expected (median)', 'Posted in', 'Status', 'Note']).font = { bold: true };
  for (const x of p.checklist) c.addRow([x.location, x.account, n(x.expected), x.posted, x.status, x.note]);
  [22, 34, 16, 10, 12, 40].forEach((w, i) => (c.getColumn(i + 1).width = w));
  c.getColumn(3).numFmt = MONEY;

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
