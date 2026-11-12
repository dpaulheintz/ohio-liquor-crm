// One-time import for Bottle Sales: the OHLQ product file + the cleaned FY2026 spreadsheet export.
//
//   ENV_FILE=/path/.env.local npx tsx scripts/import-bottle-sales.ts "<Product Information.csv>" <bottle_sales_fy2026_import.csv> [--replace]
//
// Products are upserted on sku. Sales: one entry_id per (date, location, type), priced from ohlq_products
// (per-bottle price rounded to the cent first), source = 'legacy_fy2026'. Refuses to run twice unless
// --replace (which deletes the previous legacy_fy2026 rows first). The CSVs are not stored in the repo.
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import { parseOhlqProductFile, paidPerBottle } from '../src/lib/bottle-sales';

config({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });
const [productsPath, salesPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const replace = process.argv.includes('--replace');
if (!productsPath || !salesPath) throw new Error('usage: import-bottle-sales.ts <products.csv> <sales.csv> [--replace]');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  // 1. products
  const products = parseOhlqProductFile(readFileSync(productsPath, 'utf8'));
  const { error: pErr } = await db.from('ohlq_products').upsert(products, { onConflict: 'sku' });
  if (pErr) throw new Error(`products: ${pErr.message}`);
  console.log(`products upserted: ${products.length}`);
  const bySku = new Map(products.map((p) => [p.sku, p]));

  // 2. sales
  const { count } = await db.from('bottle_sales').select('id', { count: 'exact', head: true }).eq('source', 'legacy_fy2026');
  if (count && !replace) throw new Error(`${count} legacy_fy2026 rows already exist; re-run with --replace to reload`);
  if (count && replace) {
    const { error } = await db.from('bottle_sales').delete().eq('source', 'legacy_fy2026');
    if (error) throw new Error(`delete old legacy rows: ${error.message}`);
    console.log(`deleted ${count} previous legacy rows`);
  }

  const rows = Papa.parse<Record<string, string>>(readFileSync(salesPath, 'utf8'), { header: true, skipEmptyLines: true }).data;
  const entryIds = new Map<string, string>();
  const lines = rows.map((r, i) => {
    const p = bySku.get(r.sku);
    if (!p) throw new Error(`row ${i + 2}: unknown sku ${r.sku}`);
    const bottles = Number(r.bottles);
    if (!Number.isInteger(bottles) || bottles <= 0) throw new Error(`row ${i + 2}: bad bottles ${r.bottles}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`row ${i + 2}: bad date ${r.date}`);
    const key = `${r.date}|${r.location_code}|${r.type}`;
    if (!entryIds.has(key)) entryIds.set(key, randomUUID());
    return {
      entry_id: entryIds.get(key)!, sale_date: r.date, location_code: r.location_code, type: r.type, sku: r.sku, bottles,
      paid_per_bottle: paidPerBottle(p.case_price, p.units_per_case), wholesale_price: p.wholesale_price,
      retail_price: p.retail_price, units_per_case: p.units_per_case, source: 'legacy_fy2026',
    };
  });
  for (let i = 0; i < lines.length; i += 500) {
    const { error } = await db.from('bottle_sales').insert(lines.slice(i, i + 500));
    if (error) throw new Error(`insert batch ${i / 500 + 1}: ${error.message}`);
  }
  console.log(`sales lines inserted: ${lines.length} in ${entryIds.size} entries`);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
