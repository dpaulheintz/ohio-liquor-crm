// Wholesale Forms: shared types and exact money/date helpers. All money is integer cents.

export const WHOLESALE_FORMS_PATH = '/admin/wholesale-forms';
export const WHOLESALE_BUCKET = 'wholesale-forms';

export type AccountType = 'wholesale' | 'transient';
export type FormStatus = 'draft' | 'final';

export interface WholesaleProduct {
  id: string;
  brand_code: string;
  description: string;
  unit_type: string;
  price_cents: number;
  sort_order: number;
  active: boolean;
}

export interface WholesaleCustomer {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  phone: string | null;
  account_type: AccountType;
  account_number: string | null;
  customer_id_number: string | null;
  crm_account_id: string | null;
  crm_account_name: string | null;
  notes: string | null;
  default_warehouse_id: string | null;
  times_used: number;
  last_used_at: string | null;
  last_order_date: string | null;
  archived: boolean;
  created_at: string;
}

export interface WholesaleFormLine {
  id: string;
  product_id: string | null;
  brand_code: string;
  description: string;
  unit_type: string;
  price_cents: number;
  quantity: number;
  line_total_cents: number;
  sort_order: number;
}

export interface RecipientSnapshot {
  recipient_name: string | null;
  recipient_address_line1: string | null;
  recipient_city: string | null;
  recipient_state: string | null;
  recipient_zip: string | null;
  recipient_phone: string | null;
  account_type: AccountType | null;
  account_number: string | null;
  customer_id_number: string | null;
}

export interface WholesaleForm extends RecipientSnapshot {
  id: string;
  sales_date: string;
  customer_id: string | null;
  warehouse_id: string | null;
  total_bottles: number;
  receipt_total_cents: number;
  status: FormStatus;
  completed_by_name: string | null;
  finalized_at: string | null;
  notes: string | null;
  source: 'app' | 'imported_scan';
  signed_copy_path: string | null;
  settings_snapshot: WholesaleSettings | null;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  lines: WholesaleFormLine[];
}

/** The A-3a/warehouse details printed on a form (snapshotted onto each form from its warehouse). */
export interface WholesaleSettings {
  warehouse_name?: string;
  warehouse_label: string;
  agency_number: string;
  a3a_name: string;
  a3a_address: string;
  a3a_phone: string;
  a3a_email: string;
}

export interface WholesaleWarehouse {
  id: string;
  name: string;
  label: string;
  agency_number: string;
  a3a_name: string;
  a3a_address: string;
  a3a_phone: string;
  a3a_email: string;
  is_default: boolean;
  sort_order: number;
}

export function warehouseSnapshot(w: WholesaleWarehouse): WholesaleSettings {
  return {
    warehouse_name: w.name, warehouse_label: w.label, agency_number: w.agency_number, a3a_name: w.a3a_name,
    a3a_address: w.a3a_address, a3a_phone: w.a3a_phone, a3a_email: w.a3a_email,
  };
}

/** A one-off line typed onto a form (not from the price list). */
export interface CustomLineInput {
  brand_code: string;
  description: string;
  unit_type: string;
  price_cents: number;
  quantity: number;
}

export const DEFAULT_EMAIL_RECIPIENTS = ['msmith@highbankco.com', 'dsprequest@highbankco.com'];

/** "Wholesale Form – JT's Grandview – 8/30/26 – $784.90" */
export function emailSubject(recipient: string | null, salesDate: string, totalCents: number): string {
  const [y, m, d] = salesDate.split('-').map(Number);
  return `Wholesale Form – ${recipient ?? 'Recipient'} – ${m}/${d}/${String(y).slice(-2)} – ${formatCents(totalCents)}`;
}

export function isEmail(s: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
}

// ─── Money (integer cents only) ───────────────────────────────────────────────

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Not an integer cent amount: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "$1,234.5" → 123450. Parses digits as text so no floating point is involved. Null if invalid. */
export function parseDollarsToCents(input: string): number | null {
  const m = input.trim().replace(/[$,\s]/g, '').match(/^(\d{1,7})(?:\.(\d{0,2}))?$|^\.(\d{1,2})$/);
  if (!m) return null;
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? m[3] ?? '').padEnd(2, '0');
  return Number(whole) * 100 + Number(frac);
}

/** Non-negative whole bottle count from user input, or null if invalid. */
export function parseQuantity(input: string): number | null {
  const t = input.trim();
  if (t === '') return 0;
  if (!/^\d{1,5}$/.test(t)) return null;
  return Number(t);
}

// ─── Dates ("YYYY-MM-DD" strings, never parsed with new Date) ─────────────────

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m, d];
}

/** "2026-08-30" → "8/30/2026" */
export function formatSalesDate(ymd: string): string {
  const [y, m, d] = ymdParts(ymd);
  return `${m}/${d}/${y}`;
}

/** "2026-08-30" → "8.30.26" */
export function formatFileDate(ymd: string): string {
  const [y, m, d] = ymdParts(ymd);
  return `${m}.${d}.${String(y).slice(-2)}`;
}

/** "HBD direct wholesale form 8.30.26 - JTs Grandview.pdf" */
export function pdfFileName(salesDate: string, recipient: string | null): string {
  const who = (recipient ?? 'Recipient')
    .replace(/['’]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Recipient';
  return `HBD direct wholesale form ${formatFileDate(salesDate)} - ${who}.pdf`;
}

/** "1051 Goodale Blvd., Columbus, OH 43212" → ["1051 Goodale Blvd.", "Columbus, OH 43212"] */
export function splitAddress(address: string): [string, string] {
  const i = address.indexOf(',');
  if (i === -1) return [address.trim(), ''];
  return [address.slice(0, i).trim(), address.slice(i + 1).trim()];
}

export function recipientCityLine(r: Pick<RecipientSnapshot, 'recipient_city' | 'recipient_state' | 'recipient_zip'>): string {
  const cityState = [r.recipient_city, r.recipient_state].filter(Boolean).join(', ');
  return [cityState, r.recipient_zip].filter(Boolean).join(' ');
}
