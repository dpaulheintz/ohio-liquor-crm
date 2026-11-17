// Verifies Bottle Sales agency # / GL account reporting for one month against the live database.
//   ENV_FILE=/path/.env.local npx tsx scripts/verify-bottle-sales-gl.ts 2026-10 <out-dir>
// Uses the same report builders and file writers as the dashboard, then re-reads the written files.
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { fiscalMonths, fiscalYearOf, fmtUsd, toCents, type BottleLocation } from '../src/lib/bottle-sales';
import { buildMonthEnd, buildScreenTables, byGl, sum, type DashLine, type Prod, type Table } from '../src/lib/bottle-sales-reports';
import { buildWorkbook, csvText } from '../src/app/(app)/admin/bottle-sales/export';

config({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const month = process.argv[2] ?? '2026-10';
const out = process.argv[3] ?? '.';
mkdirSync(out, { recursive: true });
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };

async function main() {
  const { data: locs } = await db.from('bottle_locations').select('code, name, sort_order, agency_number, gl_account').eq('active', true).order('sort_order');
  const locations = (locs ?? []) as BottleLocation[];
  const { data: prods } = await db.from('ohlq_products').select('sku, display_name, report_group, sort_order');
  const products: Prod[] = (prods ?? []).map((p) => ({ sku: p.sku, name: p.display_name, group: p.report_group, sort: p.sort_order }));
  const { data: fy } = await db.from('bottle_sales_settings').select('fiscal_year_start_month').maybeSingle();
  const fyStart = fy?.fiscal_year_start_month ?? 11;

  // Same mapping as the dashboard page (src/app/(app)/admin/bottle-sales/page.tsx)
  const lines: DashLine[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('bottle_sales').select('sale_date, location_code, type, sku, bottles, units_per_case, paid_amount, wholesale_amount, retail_amount')
      .order('sale_date').order('id').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) lines.push({ d: r.sale_date, loc: r.location_code, t: r.type, sku: r.sku, b: r.bottles, u: r.units_per_case, p: toCents(r.paid_amount), w: toCents(r.wholesale_amount), r: toCents(r.retail_amount) });
    if (!data || data.length < 1000) break;
  }

  // ── Dashboard numbers for the month (all locations, all types) ──
  const period = lines.filter((l) => l.d.startsWith(month));
  const dash = sum(period);
  console.log(`${month}: ${period.length} lines · ${dash.b} bottles · paid ${fmtUsd(dash.p)} · wholesale ${fmtUsd(dash.w)} · retail ${fmtUsd(dash.r)}`);

  // Independent check straight from SQL
  const [yy, mm] = month.split('-').map(Number);
  const next = `${mm === 12 ? yy + 1 : yy}-${String(mm === 12 ? 1 : mm + 1).padStart(2, '0')}-01`;
  const sqlRows: { location_code: string; bottles: number; paid_amount: number; wholesale_amount: number; retail_amount: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('bottle_sales').select('location_code, bottles, paid_amount, wholesale_amount, retail_amount')
      .gte('sale_date', `${month}-01`).lt('sale_date', next).order('id').range(from, from + 999);
    if (error) throw error;
    sqlRows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const sqlBy = new Map<string, { b: number; p: number; w: number; r: number }>();
  for (const r of sqlRows) {
    const a = sqlBy.get(r.location_code) ?? { b: 0, p: 0, w: 0, r: 0 };
    a.b += r.bottles; a.p += toCents(r.paid_amount); a.w += toCents(r.wholesale_amount); a.r += toCents(r.retail_amount);
    sqlBy.set(r.location_code, a);
  }

  const gl = byGl(period, locations);
  for (const g of gl) console.log(`  GL ${g.gl} (${g.locations.map((l) => l.code).join('+')}, agency ${g.agencies.join('/')}): ${g.a.b} btl · paid ${fmtUsd(g.a.p)} · wholesale ${fmtUsd(g.a.w)} · retail ${fmtUsd(g.a.r)}`);
  const g4322 = gl.find((g) => g.gl === '4322')!;
  const wv = sum(period.filter((l) => l.loc === 'WV')), po = sum(period.filter((l) => l.loc === 'PO'));
  check(g4322.a.b === wv.b + po.b && g4322.a.p === wv.p + po.p && g4322.a.w === wv.w + po.w && g4322.a.r === wv.r + po.r,
    `GL 4322 = Westerville (${fmtUsd(wv.p)}) + PO Box 21 (${fmtUsd(po.p)}) = ${fmtUsd(g4322.a.p)} paid, to the cent (bottles and all $ columns)`);
  const sqlWvPo = ['WV', 'PO'].map((c) => sqlBy.get(c) ?? { b: 0, p: 0, w: 0, r: 0 }).reduce((a, x) => ({ b: a.b + x.b, p: a.p + x.p, w: a.w + x.w, r: a.r + x.r }));
  check(g4322.a.p === sqlWvPo.p && g4322.a.w === sqlWvPo.w && g4322.a.r === sqlWvPo.r && g4322.a.b === sqlWvPo.b, 'GL 4322 matches a direct SQL sum of WV + PO');
  const glTot = gl.reduce((a, g) => ({ b: a.b + g.a.b, p: a.p + g.a.p, w: a.w + g.a.w, r: a.r + g.a.r }), { b: 0, p: 0, w: 0, r: 0 });
  check(glTot.b === dash.b && glTot.p === dash.p && glTot.w === dash.w && glTot.r === dash.r, `GL rollup total ${fmtUsd(glTot.p)} = dashboard total ${fmtUsd(dash.p)} (bottles, paid, wholesale, retail)`);
  const sqlAll = [...sqlBy.values()].reduce((a, x) => ({ b: a.b + x.b, p: a.p + x.p, w: a.w + x.w, r: a.r + x.r }), { b: 0, p: 0, w: 0, r: 0 });
  check(sqlAll.p === dash.p && sqlAll.b === dash.b, `dashboard total matches a direct SQL sum (${fmtUsd(sqlAll.p)})`);

  // ── Exports: the dashboard's CSV / XLSX with the month selected, and the Month-End Summary ──
  const fyNum = fiscalYearOf(`${month}-01`, fyStart);
  const fyLines = lines.filter((l) => fiscalYearOf(l.d, fyStart) === fyNum);
  const tables = buildScreenTables({
    lines: period, products, locations, periodLabel: `FY${fyNum} ${month}`, months: fiscalMonths(fyNum, fyStart), matrixLines: fyLines,
    matrixMetric: { key: 'b', label: 'Bottles' },
  });
  const csv = csvText(tables);
  writeFileSync(path.join(out, `bottle-sales-${month}.csv`), '﻿' + csv);
  const xlsxPath = path.join(out, `bottle-sales-${month}.xlsx`);
  await (await buildWorkbook(tables.map((t) => ({ name: t.title.slice(0, 28), tables: [t] })))).xlsx.writeFile(xlsxPath);
  const me = buildMonthEnd(month, lines, products, locations);
  const mePath = path.join(out, `bottle-sales-month-end-${month}.xlsx`);
  await (await buildWorkbook(me.sheets)).xlsx.writeFile(mePath);
  check(me.grandTotal.p === dash.p && me.grandTotal.w === dash.w && me.grandTotal.r === dash.r && me.grandTotal.b === dash.b, `Month-End grand total ${fmtUsd(me.grandTotal.p)} = dashboard`);

  // Every data row in every table carries agency_number + gl_account (built tables)
  const tableRowsOk = (ts: Table[]) => {
    let rows = 0, bad = 0;
    for (const t of ts) {
      const ai = t.header.indexOf('agency_number'), gi = t.header.indexOf('gl_account');
      if (!t.header.length) continue;
      if (ai < 0 || gi < 0) { bad += t.rows.length || 1; console.log(`   missing columns in "${t.title}"`); continue; }
      for (const r of t.rows) { rows++; if (r[ai] === '' || r[ai] == null || r[gi] === '' || r[gi] == null) bad++; }
    }
    return { rows, bad };
  };
  const s1 = tableRowsOk(tables);
  check(s1.bad === 0, `CSV/XLSX tables: ${s1.rows} rows across ${tables.length} tables, all with agency_number + gl_account`);
  const s2 = tableRowsOk(me.sheets.flatMap((s) => s.tables));
  check(s2.bad === 0, `Month-End: ${s2.rows} rows, all with agency_number + gl_account`);

  // Re-read the written CSV
  const csvLines = csv.split('\r\n');
  let header: string[] = [], csvRows = 0, csvBad = 0;
  for (let i = 0; i < csvLines.length; i++) {
    const cells = csvLines[i].split(','); // no commas inside our location/GL fields
    if (csvLines[i] === '') { header = []; continue; }
    if (!header.length && i + 1 < csvLines.length && csvLines[i + 1].includes('agency_number')) continue; // title line
    if (cells.includes('agency_number')) { header = cells; continue; }
    if (!header.length) continue;
    const ai = header.indexOf('agency_number'), gi = header.indexOf('gl_account');
    csvRows++;
    if (!cells[ai] || !cells[gi]) csvBad++;
  }
  check(csvRows > 0 && csvBad === 0, `written CSV: ${csvRows} data rows, every one has agency_number + gl_account`);

  // Re-read the written XLSX files
  for (const [label, file] of [['XLSX', xlsxPath], ['Month-End XLSX', mePath]] as const) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    let rows = 0, bad = 0, ai = -1, gi = -1;
    wb.eachSheet((ws) => {
      ai = -1; gi = -1;
      ws.eachRow({ includeEmpty: true }, (row) => {
        const vals = (row.values as unknown[]).slice(1).map((v) => (v == null ? '' : String(v)));
        if (vals.every((v) => v === '')) { ai = -1; gi = -1; return; }
        if (vals.includes('agency_number')) { ai = vals.indexOf('agency_number'); gi = vals.indexOf('gl_account'); return; }
        if (ai < 0) return; // title rows
        rows++;
        if (!vals[ai] || !vals[gi]) bad++;
      });
    });
    check(rows > 0 && bad === 0, `written ${label}: ${rows} data rows, every one has agency_number + gl_account`);
  }

  // Month-End layout: one section per location, Retail/Bar/Batch, then GL rollup
  const s = me.sheets[0];
  const titles = s.tables.map((t) => t.title);
  check(locations.every((l) => titles.some((t) => t.startsWith(`${l.name} · Agency # ${l.agency_number} · GL # ${l.gl_account}`))), `Month-End sections: ${titles.slice(1, 1 + locations.length).join(' | ')}`);
  check(s.tables.slice(1, 1 + locations.length).every((t) => ['Retail', 'Bar', 'Batch'].every((ty) => t.rows.some((r) => r[0] === ty))), 'each location section is split Retail / Bar / Batch');
  const roll = s.tables[s.tables.length - 1];
  console.log(`  ${roll.title}`);
  for (const r of roll.rows) console.log(`    ${String(r[0]).padEnd(12)} agency ${String(r[1]).padEnd(6)} ${String(r[2]).padEnd(36)} ${r[3]} btl · paid ${fmtUsd((r[5] as { usd: number }).usd)} · wholesale ${fmtUsd((r[6] as { usd: number }).usd)} · retail ${fmtUsd((r[7] as { usd: number }).usd)}`);
  check(roll.rows.map((r) => r[0]).join(',') === '4322,4323,4324,Grand total', 'GL rollup lines: 4322, 4323, 4324, Grand total');

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
