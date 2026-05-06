'use strict';

/**
 * Parses all CSV pairs in a directory and writes batched UPSERT SQL files:
 *   /tmp/hb_sales.sql
 *   /tmp/hb_wholesale.sql
 *
 * Run: node scripts/gen-inserts.js "/path/to/csv/folder"
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { resolveBrand, resolveAgency, parseAmount, parseBottles } = require('./brand-taxonomy.js');

const DIR = process.argv[2];
if (!DIR) { console.error('Usage: node scripts/gen-inserts.js <csv-dir>'); process.exit(1); }

const SALES_RE    = /^(\d{4}-\d{2})_High_Bank_Sales\.csv$/i;
const WHOLESALE_RE = /^(\d{4}-\d{2})_High_Bank_Sales_Wholesale\.csv$/i;
const BATCH = 200;

function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }
function parseFile(fp) {
  const txt = stripBom(fs.readFileSync(fp, 'utf8'));
  return Papa.parse(txt, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() }).data;
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Collect rows
const files = fs.readdirSync(DIR);
const months = {};
for (const f of files) {
  const sm = f.match(SALES_RE), wm = f.match(WHOLESALE_RE);
  if (sm)      { months[sm[1]] = months[sm[1]] || {}; months[sm[1]].s = path.join(DIR, f); }
  else if (wm) { months[wm[1]] = months[wm[1]] || {}; months[wm[1]].w = path.join(DIR, f); }
}

const sortedMonths = Object.keys(months).sort();
const salesRows = [], wholesaleRows = [];
const unknownCodes = {};

for (const month of sortedMonths) {
  const { s, w } = months[month];

  if (s) {
    for (const r of parseFile(s)) {
      const bc = String(r['Brand'] ?? '').trim();
      const brand = resolveBrand(bc, String(r['Name'] ?? '').trim());
      const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
      if (brand.brand_family === 'Unknown') { unknownCodes[bc] = (unknownCodes[bc] || 0) + 1; }
      salesRows.push({
        month, agency_id: String(r['Agency_Id']??'').trim(),
        agency_name: r['Agency_Name']||null, district: r['District']||null,
        vendor: r['Vendor']||null, ...brand, category: r['Category']||null, ...agency,
        retail_bottles: parseBottles(r['Retail_Bottles_Sold']),
        retail_amount: parseAmount(r['Retail_Amount']),
        wholesale_bottles: parseBottles(r['Wholesale_Bottles_Sold']),
        wholesale_amount: parseAmount(r['Wholesale_Amount']),
      });
    }
  }

  if (w) {
    for (const r of parseFile(w)) {
      const bc = String(r['Brand'] ?? '').trim();
      const brand = resolveBrand(bc, String(r['Name'] ?? '').trim());
      const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
      if (brand.brand_family === 'Unknown') { unknownCodes[bc] = (unknownCodes[bc] || 0) + 1; }
      wholesaleRows.push({
        month, agency_id: String(r['Agency_Id']??'').trim(),
        agency_name: r['Agency_Name']||null, district: r['District']||null,
        vendor: r['DimVendor_VendorNumber_']||null, ...brand, category: r['Category']||null, ...agency,
        permit_number: String(r['Permit_Number']??'').trim(),
        wholesaler_name: r['Wholesaler']||null, dba: r['Doing_Business_As']||null,
        bottles_sold: parseBottles(r['Wholesale_Bottles_Sold']),
        amount: parseAmount(r['Wholesale_Amount']),
      });
    }
  }
}

// Generate sales SQL
function genSalesSQL(rows) {
  const cols = ['month','agency_id','agency_name','district','vendor','brand_code','product_name',
    'category','brand_family','sub_product','size','is_hb_agency','hb_location',
    'retail_bottles','retail_amount','wholesale_bottles','wholesale_amount'];
  const conflict = 'month,agency_id,brand_code';
  const update = cols.filter(c => !['month','agency_id','brand_code'].includes(c))
    .map(c => `${c}=EXCLUDED.${c}`).join(',');
  let sql = '';
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals = batch.map(r =>
      `(${cols.map(c => esc(r[c])).join(',')})`
    ).join(',\n');
    sql += `INSERT INTO sales_monthly (${cols.join(',')}) VALUES\n${vals}\nON CONFLICT (${conflict}) DO UPDATE SET ${update};\n\n`;
  }
  return sql;
}

function genWholesaleSQL(rows) {
  const cols = ['month','agency_id','agency_name','district','vendor','brand_code','product_name',
    'category','brand_family','sub_product','size','is_hb_agency','hb_location',
    'permit_number','wholesaler_name','dba','bottles_sold','amount'];
  const conflict = 'month,agency_id,brand_code,permit_number';
  const update = cols.filter(c => !['month','agency_id','brand_code','permit_number'].includes(c))
    .map(c => `${c}=EXCLUDED.${c}`).join(',');
  let sql = '';
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals = batch.map(r =>
      `(${cols.map(c => esc(r[c])).join(',')})`
    ).join(',\n');
    sql += `INSERT INTO wholesale_detail (${cols.join(',')}) VALUES\n${vals}\nON CONFLICT (${conflict}) DO UPDATE SET ${update};\n\n`;
  }
  return sql;
}

const salesSQL = genSalesSQL(salesRows);
const wholesaleSQL = genWholesaleSQL(wholesaleRows);

fs.writeFileSync('/tmp/hb_sales.sql', salesSQL);
fs.writeFileSync('/tmp/hb_wholesale.sql', wholesaleSQL);

console.log(`Months   : ${sortedMonths.length} (${sortedMonths[0]} → ${sortedMonths[sortedMonths.length-1]})`);
console.log(`Sales    : ${salesRows.length} rows → /tmp/hb_sales.sql (${(salesSQL.length/1024).toFixed(0)} KB)`);
console.log(`Wholesale: ${wholesaleRows.length} rows → /tmp/hb_wholesale.sql (${(wholesaleSQL.length/1024).toFixed(0)} KB)`);
if (Object.keys(unknownCodes).length) {
  console.log('Unknown codes:', unknownCodes);
} else {
  console.log('No unrecognized brand codes.');
}
