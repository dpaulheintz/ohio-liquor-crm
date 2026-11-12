'use server';

// Bottle Sales Tracker: writes. Each one re-checks access here and again in the database function.
import { revalidatePath } from 'next/cache';
import { requireBottleSalesAccess, loadProducts } from '@/lib/bottle-sales-server';
import { BOTTLE_SALES_PATH, SALE_TYPES, parseOhlqProductFile, paidPerBottle, toCents, type ProductInput } from '@/lib/bottle-sales';

export interface SaveEntryInput {
  entryId: string | null;
  date: string;
  location: string;
  type: string;
  notes: string;
  lines: { id?: string | null; sku: string; bottles: number }[];
}
export interface SaveEntryResult { entryId: string; bottles: number; paid_c: number; wholesale_c: number; retail_c: number }

export async function saveBottleSalesEntry(input: SaveEntryInput): Promise<SaveEntryResult> {
  const sb = await requireBottleSalesAccess();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Pick a date');
  if (!SALE_TYPES.includes(input.type as (typeof SALE_TYPES)[number])) throw new Error('Pick a type');
  const lines = input.lines
    .filter((l) => l.bottles > 0)
    .map((l) => {
      if (!Number.isInteger(l.bottles)) throw new Error('Bottles must be whole numbers');
      return { id: l.id ?? null, sku: l.sku, bottles: l.bottles };
    });
  if (!lines.length) throw new Error('Add at least one bottle');
  const { data, error } = await sb.rpc('bottle_sales_save_entry', {
    p_entry_id: input.entryId, p_date: input.date, p_location: input.location, p_type: input.type,
    p_notes: input.notes ?? '', p_lines: lines,
  });
  if (error) throw new Error(error.message);
  const d = data as { entry_id: string; bottles: number; paid: number; wholesale: number; retail: number };
  revalidatePath(BOTTLE_SALES_PATH, 'layout');
  return { entryId: d.entry_id, bottles: Number(d.bottles), paid_c: toCents(d.paid), wholesale_c: toCents(d.wholesale), retail_c: toCents(d.retail) };
}

export async function deleteBottleSalesEntry(entryId: string): Promise<number> {
  const sb = await requireBottleSalesAccess();
  const { data, error } = await sb.rpc('bottle_sales_delete_entry', { p_entry_id: entryId });
  if (error) throw new Error(error.message);
  revalidatePath(BOTTLE_SALES_PATH, 'layout');
  return Number(data);
}

// ─── OHLQ product file upload: diff first, then apply ────────────────────────

export interface ProductDiff {
  added: ProductInput[];
  priceChanges: { sku: string; name: string; field: string; from: number; to: number }[];
  otherChanges: { sku: string; name: string; field: string; from: string; to: string }[];
  missingFromFile: { sku: string; name: string }[];
  unchanged: number;
  total: number;
}

export async function previewProductFile(text: string): Promise<ProductDiff> {
  const sb = await requireBottleSalesAccess();
  const rows = parseOhlqProductFile(text);
  if (!rows.length) throw new Error('No products found in that file');
  const current = new Map((await loadProducts(sb)).map((p) => [p.sku, p]));
  const diff: ProductDiff = { added: [], priceChanges: [], otherChanges: [], missingFromFile: [], unchanged: 0, total: rows.length };
  const fileSkus = new Set(rows.map((r) => r.sku));
  for (const r of rows) {
    const c = current.get(r.sku);
    if (!c) { diff.added.push(r); continue; }
    let changed = false;
    const money: [string, number, number][] = [
      ['Paid per bottle', c.paid_per_bottle, paidPerBottle(r.case_price, r.units_per_case)],
      ['Case price', c.case_price, r.case_price],
      ['Wholesale', c.wholesale_price, r.wholesale_price],
      ['Retail (MSRP)', c.retail_price, r.retail_price],
    ];
    for (const [field, from, to] of money) if (toCents(from) !== toCents(to)) { diff.priceChanges.push({ sku: r.sku, name: c.display_name, field, from, to }); changed = true; }
    const other: [string, unknown, unknown][] = [
      ['Units per case', c.units_per_case, r.units_per_case], ['Status', c.status, r.status], ['Detail code', c.detail_code, r.detail_code],
      ['Item name', c.item_name, r.item_name], ['UPC', c.upc, r.upc],
    ];
    for (const [field, from, to] of other) if (String(from ?? '') !== String(to ?? '')) { diff.otherChanges.push({ sku: r.sku, name: c.display_name, field, from: String(from ?? ''), to: String(to ?? '') }); changed = true; }
    if (!changed) diff.unchanged++;
  }
  for (const c of current.values()) if (!fileSkus.has(c.sku)) diff.missingFromFile.push({ sku: c.sku, name: c.display_name });
  return diff;
}

export async function applyProductFile(text: string): Promise<number> {
  const sb = await requireBottleSalesAccess();
  const rows = parseOhlqProductFile(text);
  if (!rows.length) throw new Error('No products found in that file');
  const { data, error } = await sb.rpc('bottle_sales_apply_products', { p_rows: rows });
  if (error) throw new Error(error.message);
  revalidatePath(BOTTLE_SALES_PATH, 'layout');
  return Number(data);
}
