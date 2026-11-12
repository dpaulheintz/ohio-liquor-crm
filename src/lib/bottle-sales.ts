// Bottle Sales Tracker: shared types and pure helpers (client + server).
import Papa from 'papaparse';

export const BOTTLE_SALES_PATH = '/admin/bottle-sales';

/** Who can use Bottle Sales. Mirrors public.bottle_sales_can_use() in the database; change both together. */
export const BOTTLE_SALES_EMAILS = ['distillery@highbankco.com', 'pheintzman@highbankco.com', 'accounting@highbankco.com'];
export const canUseBottleSales = (email: string | null | undefined) => !!email && BOTTLE_SALES_EMAILS.includes(email.toLowerCase());

export const SALE_TYPES = ['Retail', 'Bar', 'Batch'] as const;
export type SaleType = (typeof SALE_TYPES)[number];
export const REPORT_GROUPS = ['Whiskey', 'Vodka', 'Gin', 'Rum', 'RTD', '200 mL'] as const;

export interface BottleLocation { code: string; name: string; sort_order: number }

export interface OhlqProduct {
  sku: string;
  item_name: string;
  display_name: string;
  category: string | null;
  report_group: string;
  proof: number | null;
  age: number | null;
  status: string | null;
  detail_code: string | null;
  upc: string | null;
  case_price: number;
  units_per_case: number;
  volume_l: number | null;
  retail_price: number;
  wholesale_price: number;
  paid_per_bottle: number;
  active: boolean;
  sort_order: number;
}

/** One SKU line as the dashboard uses it. Money in integer cents. */
export interface SaleLine {
  id: string;
  entry_id: string;
  sale_date: string;
  location_code: string;
  type: SaleType;
  sku: string;
  bottles: number;
  units_per_case: number;
  paid_c: number;
  wholesale_c: number;
  retail_c: number;
  paid_per_bottle: number;
  source: string;
  notes: string | null;
}

// ─── Money (integer cents so sums are exact) ─────────────────────────────────

export const toCents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100);
export function fmtUsd(cents: number): string {
  const neg = cents < 0, c = Math.abs(cents);
  return `${neg ? '-' : ''}$${Math.floor(c / 100).toLocaleString('en-US')}.${String(c % 100).padStart(2, '0')}`;
}
export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtCases = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Per-bottle price, rounded to the cent first (the old sheet's "P" column). */
export const paidPerBottle = (casePrice: number, units: number) => Math.round((casePrice / units) * 100) / 100;

// ─── Fiscal year (FY2026 = Nov 2025 - Oct 2026 when the start month is 11) ───

export function fiscalYearOf(dateOrMonth: string, startMonth: number): number {
  const y = Number(dateOrMonth.slice(0, 4)), m = Number(dateOrMonth.slice(5, 7));
  return startMonth === 1 ? y : m >= startMonth ? y + 1 : y;
}
export function fiscalMonths(fy: number, startMonth: number): string[] {
  const out: string[] = [];
  let y = startMonth === 1 ? fy : fy - 1, m = startMonth;
  for (let i = 0; i < 12; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
export const monthLabel = (ym: string, withYear = false) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });

// ─── OHLQ product file ────────────────────────────────────────────────────────

/** OHLQ "Volume" is fluid ounces. Map to the bottle size we print. */
const SIZE_BY_OZ: [number, number][] = [[6.8, 200], [20.3, 600], [20.4, 600], [25.4, 750], [33.8, 1000], [59.2, 1750]];
export function sizeMl(volumeOz: number): number {
  const hit = SIZE_BY_OZ.find(([oz]) => Math.abs(oz - volumeOz) < 0.05);
  return hit ? hit[1] : Math.round((volumeOz * 29.5735) / 50) * 50;
}
export const sizeLabel = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toString()} L` : `${ml} mL`);

const SMALL_WORDS = new Set(['x', 'of', 'and', 'the', 'a']);
const KEEP_UPPER = new Set(['RTD', 'OHLQ']);
const WORD_FIX: Record<string, string> = { WHSKY: 'Whiskey', BRL: 'Barrel', DBLE: 'Double', CORBIN: 'Corbin' };

/** "HIGH BANK WHISKEY WAR" + 750 mL → "Whiskey War 750 mL"; drops the brand prefix and title-cases. */
export function friendlyName(itemName: string, ml: number, isPack = false): string {
  let n = itemName.trim().replace(/\s+/g, ' ');
  n = n.replace(/^HIGH BANK DISTILLERY\s+/i, '').replace(/^HIGH BANK\s+/i, '');
  const words = n.split(' ').map((w, i) => {
    const up = w.toUpperCase(), core = up.replace(/[^A-Z']/g, '');
    if (WORD_FIX[core]) return w.toUpperCase().replace(core, WORD_FIX[core]);
    if (KEEP_UPPER.has(core) || /^\(\d+\)$/.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
    return w.toLowerCase().replace(/(^|[^a-z'])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  });
  let base = words.join(' ');
  if (/^(Vodka|Gin|Rum|Whiskey|Bourbon)$/.test(base)) base = `High Bank ${base}`; // "Vodka" alone → "High Bank Vodka"
  return isPack ? base : `${base} ${sizeLabel(ml)}`;
}

export function reportGroup(itemName: string, category: string, ml: number): string {
  if (ml <= 200 || /SAMPLE PACK/i.test(itemName)) return '200 mL';
  if (/\bRTD\b/i.test(itemName)) return 'RTD';
  if (/vodka/i.test(category)) return 'Vodka';
  if (/gin/i.test(category)) return 'Gin';
  if (/rum/i.test(category)) return 'Rum';
  return 'Whiskey';
}

export type ProductInput = Omit<OhlqProduct, 'paid_per_bottle'>;

/** Parse OHLQ's Product_Information.csv. Throws on a file that doesn't look like one. */
export function parseOhlqProductFile(text: string): ProductInput[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  const need = ['ItemId', 'ItemName', 'CasePrice', 'Unit', 'Volume', 'RetailPrice', 'WholesalePrice'];
  const fields = parsed.meta.fields ?? [];
  const missing = need.filter((f) => !fields.includes(f));
  if (missing.length) throw new Error(`Not an OHLQ product file (missing ${missing.join(', ')})`);
  const num = (v: string | undefined) => (v == null || v.trim() === '' ? null : Number(v));
  const rows: ProductInput[] = [];
  parsed.data.forEach((r, i) => {
    const sku = (r.ItemId ?? '').trim();
    if (!sku) return;
    const units = Number(r.Unit), casePrice = Number(r.CasePrice);
    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(casePrice)) throw new Error(`Row ${i + 2} (${sku}): bad CasePrice or Unit`);
    const oz = Number(r.Volume), ml = sizeMl(oz), name = (r.ItemName ?? '').trim();
    const status = (r.Status ?? '').trim() || null, detail = (r.DetailCodeDescription ?? '').trim() || null;
    const isPack = /SAMPLE PACK/i.test(name);
    rows.push({
      sku, item_name: name,
      display_name: friendlyName(name, ml, isPack),
      category: (r.Category ?? '').trim() || null,
      report_group: reportGroup(name, r.Category ?? '', ml),
      proof: num(r.Proof), age: num(r.Age) === null ? null : Math.round(Number(r.Age)),
      status, detail_code: detail, upc: (r.UPC ?? '').trim() || null,
      case_price: casePrice, units_per_case: units, volume_l: ml / 1000,
      retail_price: Number(r.RetailPrice), wholesale_price: Number(r.WholesalePrice),
      active: !/delist|inactive/i.test(`${status ?? ''} ${detail ?? ''}`),
      sort_order: i,
    });
  });
  return rows;
}

/** Product is hidden from Log Sales unless "show all" is on. */
export const isDelisted = (p: Pick<OhlqProduct, 'active' | 'detail_code' | 'status'>) =>
  !p.active || /delist/i.test(`${p.detail_code ?? ''} ${p.status ?? ''}`);
