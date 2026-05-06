'use strict';

/**
 * Historical bulk ingestion script
 *
 * Reads CSV pairs from /data/historical/ and upserts to Supabase.
 *
 * Filename convention:
 *   YYYY-MM_High_Bank_Sales.csv            → sales_monthly
 *   YYYY-MM_High_Bank_Sales_Wholesale.csv  → wholesale_detail
 *
 * Requirements:
 *   NEXT_PUBLIC_SUPABASE_URL  — from .env.local
 *   SUPABASE_SERVICE_ROLE_KEY — from .env.local (bypasses RLS)
 *
 * Run: node scripts/ingest-historical.js
 */

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');
const { resolveBrand, resolveAgency, parseAmount, parseBottles } = require('./brand-taxonomy.js');

// ─── Config ───────────────────────────────────────────────────────────────────

const HISTORICAL_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), 'data', 'historical');
const CHUNK_SIZE = 500;

const SALES_RE = /^(\d{4}-\d{2})_High_Bank_Sales\.csv$/i;
const WHOLESALE_RE = /^(\d{4}-\d{2})_High_Bank_Sales_Wholesale\.csv$/i;

// ─── Supabase (service role — bypasses RLS) ───────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripBom(str) {
  return str.charCodeAt(0) === 0xFEFF ? str.slice(1) : str;
}

function parseCSVFile(filepath) {
  const content = stripBom(fs.readFileSync(filepath, 'utf8'));
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

function buildSalesRows(rawRows, month) {
  return rawRows.map((r) => {
    const brandCode = String(r['Brand'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    const brand = resolveBrand(brandCode, rawName);
    const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
    return {
      month,
      agency_id: String(r['Agency_Id'] ?? '').trim(),
      agency_name: r['Agency_Name'] || null,
      district: r['District'] || null,
      vendor: r['Vendor'] || null,
      ...brand,
      category: r['Category'] || null,
      ...agency,
      retail_bottles: parseBottles(r['Retail_Bottles_Sold']),
      retail_amount: parseAmount(r['Retail_Amount']),
      wholesale_bottles: parseBottles(r['Wholesale_Bottles_Sold']),
      wholesale_amount: parseAmount(r['Wholesale_Amount']),
    };
  });
}

function buildWholesaleRows(rawRows, month) {
  return rawRows.map((r) => {
    const brandCode = String(r['Brand'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    const brand = resolveBrand(brandCode, rawName);
    const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
    return {
      month,
      agency_id: String(r['Agency_Id'] ?? '').trim(),
      agency_name: r['Agency_Name'] || null,
      district: r['District'] || null,
      vendor: r['DimVendor_VendorNumber_'] || null,
      ...brand,
      category: r['Category'] || null,
      ...agency,
      permit_number: String(r['Permit_Number'] ?? '').trim(),
      wholesaler_name: r['Wholesaler'] || null,
      dba: r['Doing_Business_As'] || null,
      bottles_sold: parseBottles(r['Wholesale_Bottles_Sold']),
      amount: parseAmount(r['Wholesale_Amount']),
    };
  });
}

function deduplicateRows(rows, keyFn) {
  const seen = new Map();
  for (const row of rows) {
    seen.set(keyFn(row), row); // last row wins on duplicate key
  }
  return Array.from(seen.values());
}

async function upsertChunked(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.log(`Historical data directory not found: ${HISTORICAL_DIR}`);
    console.log('Create the directory and add CSV files to process them.');
    process.exit(0);
  }

  const files = fs.readdirSync(HISTORICAL_DIR);

  // Build month → { salesFile, wholesaleFile } map
  const months = {};

  for (const filename of files) {
    const salesMatch = filename.match(SALES_RE);
    const wholesaleMatch = filename.match(WHOLESALE_RE);

    if (salesMatch) {
      const month = salesMatch[1];
      if (!months[month]) months[month] = {};
      months[month].salesFile = filename;
    } else if (wholesaleMatch) {
      const month = wholesaleMatch[1];
      if (!months[month]) months[month] = {};
      months[month].wholesaleFile = filename;
    } else {
      console.warn(`  [SKIP] Unrecognized filename: ${filename}`);
    }
  }

  const sortedMonths = Object.keys(months).sort();

  if (sortedMonths.length === 0) {
    console.log('No matching CSV files found in', HISTORICAL_DIR);
    process.exit(0);
  }

  console.log(`Found ${sortedMonths.length} month(s) to process.\n`);

  // Summary counters
  let totalSalesRows = 0;
  let totalWholesaleRows = 0;
  const unknownCodes = {};

  for (const month of sortedMonths) {
    const { salesFile, wholesaleFile } = months[month];
    process.stdout.write(`Processing ${month}...`);

    let salesRows = [];
    let wholesaleRows = [];

    if (salesFile) {
      const rawSales = parseCSVFile(path.join(HISTORICAL_DIR, salesFile));
      salesRows = buildSalesRows(rawSales, month);
    } else {
      console.warn(`  [WARN] No sales file for ${month}`);
    }

    if (wholesaleFile) {
      const rawWholesale = parseCSVFile(path.join(HISTORICAL_DIR, wholesaleFile));
      wholesaleRows = buildWholesaleRows(rawWholesale, month);
    } else {
      console.warn(`  [WARN] No wholesale file for ${month}`);
    }

    // Track unrecognized codes
    for (const row of [...salesRows, ...wholesaleRows]) {
      if (row.brand_family === 'Unknown') {
        const key = row.brand_code;
        if (!unknownCodes[key]) unknownCodes[key] = { product_name: row.product_name, count: 0 };
        unknownCodes[key].count++;
      }
    }

    // Deduplicate (some CSVs have duplicate rows for the same unique key)
    const dedupedSales = deduplicateRows(salesRows, r => `${r.month}|${r.agency_id}|${r.brand_code}`);
    const dedupedWholesale = deduplicateRows(wholesaleRows, r => `${r.month}|${r.agency_id}|${r.brand_code}|${r.permit_number}`);

    // Upsert
    if (dedupedSales.length > 0) {
      await upsertChunked('sales_monthly', dedupedSales, 'month,agency_id,brand_code');
    }
    if (dedupedWholesale.length > 0) {
      await upsertChunked('wholesale_detail', dedupedWholesale, 'month,agency_id,brand_code,permit_number');
    }

    totalSalesRows += dedupedSales.length;
    totalWholesaleRows += dedupedWholesale.length;

    const dupS = salesRows.length - dedupedSales.length;
    const dupW = wholesaleRows.length - dedupedWholesale.length;
    const dupNote = (dupS + dupW) > 0 ? ` (${dupS + dupW} dupes removed)` : '';
    console.log(` ${dedupedSales.length} sales rows, ${dedupedWholesale.length} wholesale rows. Done.${dupNote}`);
  }

  // Final summary
  console.log('\n─────────────────────────────────────');
  console.log(`Months processed : ${sortedMonths.length}`);
  console.log(`Total sales rows : ${totalSalesRows}`);
  console.log(`Total wholesale  : ${totalWholesaleRows}`);

  const unknownEntries = Object.entries(unknownCodes);
  if (unknownEntries.length > 0) {
    console.log(`\nUnrecognized brand codes (${unknownEntries.length}):`);
    for (const [code, info] of unknownEntries.sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${code.padEnd(8)} "${info.product_name}"  — ${info.count} row(s)`);
    }
  } else {
    console.log('No unrecognized brand codes.');
  }

  console.log('─────────────────────────────────────');
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
