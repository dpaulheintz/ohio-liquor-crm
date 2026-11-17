// OHLQ Ops concept demo — client-safe constants, types and pure rules (no server imports).

export const DEMO_BASE = '/demo/ohlq';
export const DEMO_EMAIL = 'pheintzman@highbankco.com'; // every demo email/text is delivered here

export const PARTNER = {
  name: 'High Bank Distillery',
  vendorNumber: 'Z30174001',
  address: '1051 Goodale Blvd',
  city: 'Columbus',
  state: 'OH',
  zip: '43212',
  phone: '614-826-5247',
  email: DEMO_EMAIL,
  user: DEMO_EMAIL,
} as const;

export const OPS_ACTOR = 'OHLQ Agency Operations (demo reviewer)';
export const SUPPLIER_ACTOR = `${PARTNER.name} (${PARTNER.user})`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Signature {
  w: number;
  h: number;
  strokes: [number, number][][];
}

export interface Product {
  code: string;
  name: string;
  size: string;
  volumeL: number;
  priceCents: number; // wholesale price per bottle
  retailCents: number;
  status: string;
}

export interface Agency {
  id: string; // agency number
  name: string;
  address: string;
  city: string;
  zip: string;
  county: string | null;
}

export interface Customer {
  id: string;
  name: string;
  dba: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  county: string | null;
  is_f2: boolean;
  permit_number: string;
  permit_verified: boolean;
}

export type SaleStatus = 'draft' | 'awaiting_customer' | 'signed' | 'submitted' | 'processed' | 'returned';

export interface SaleLine {
  id?: string;
  brand_code: string;
  description: string;
  size_label: string | null;
  volume_l: number | null;
  price_cents: number;
  quantity: number;
  line_total_cents: number;
  sort_order: number;
}

export interface Sale {
  id: string;
  ref_no: string;
  supplier_name: string;
  status: SaleStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_dba: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  customer_county: string | null;
  is_f2: boolean;
  permit_number: string | null;
  sales_date: string;
  subtotal_cents: number;
  sin_tax_cents: number;
  sin_tax_note: string | null;
  total_cents: number;
  a3a_signature: Signature | null;
  a3a_signer_name: string | null;
  a3a_signer_title: string | null;
  a3a_signed_at: string | null;
  a3a_device: string | null;
  customer_signature: Signature | null;
  customer_signer_name: string | null;
  customer_signed_at: string | null;
  customer_device: string | null;
  customer_consent: boolean;
  sign_token: string | null;
  sign_method: 'email' | 'sms' | 'in_person' | null;
  sign_sent_to: string | null;
  sign_sent_at: string | null;
  submitted_at: string | null;
  processed_at: string | null;
  return_note: string | null;
  created_at: string;
  updated_at: string;
  lines: SaleLine[];
}

export type TastingStatus = 'submitted' | 'approved' | 'rejected';
export type ApplicantType = 'solicitor' | 'broker' | 'trade_marketing';

export interface Tasting {
  id: string;
  ref_no: string;
  supplier_name: string;
  status: TastingStatus;
  agency_id: string;
  agency_name: string | null;
  agency_address: string | null;
  agency_city: string | null;
  agency_state: string;
  agency_zip: string | null;
  agency_county: string | null;
  staff_granted: string | null;
  event_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM[:SS]
  end_time: string;
  conductor_name: string | null;
  solicitor_reg_no: string | null;
  reg_expires: string | null;
  applicant_type: ApplicantType | null;
  training_confirmed: boolean;
  products: { code: string; name: string }[];
  employer: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  applicant_signature: Signature | null;
  applicant_signer_name: string | null;
  signed_at: string | null;
  submitted_at: string;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface SinTaxConfig {
  counties: { county: string; centsPerGallon: number; note: string }[];
}

export const DEFAULT_SIN_TAX: SinTaxConfig = {
  counties: [{ county: 'Cuyahoga County', centsPerGallon: 300, note: 'Placeholder rate — to be confirmed with OHLQ' }],
};

export const APPLICANT_TYPES: { value: ApplicantType; label: string }[] = [
  { value: 'solicitor', label: 'Solicitor' },
  { value: 'broker', label: 'Broker' },
  { value: 'trade_marketing', label: 'Trade marketing professional' },
];

export const ORC_4301_253_ITEMS = [
  '(A) Instruction on the statutes and rules that govern the sale of beer, wine, mixed beverages, and intoxicating liquor;',
  '(B) Instruction on the prevention of the illegal serving of beer, wine, mixed beverages, and intoxicating liquor to persons under twenty-one years of age;',
  '(C) Use of conflict management skills in alcohol-related situation;',
  '(D) Instruction on methods to safely evacuate the premises of a permit holder in an emergency.',
];

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  draft: 'Draft',
  awaiting_customer: 'Awaiting Customer Signature',
  signed: 'Signed',
  submitted: 'Submitted to OHLQ',
  processed: 'Processed',
  returned: 'Returned to Supplier',
};

export const TASTING_STATUS_LABEL: Record<TastingStatus, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ─── Money ────────────────────────────────────────────────────────────────────

export function fmtCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${neg ? '-' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

export const toCents = (dollars: number | string | null | undefined): number =>
  Math.round(Number(dollars ?? 0) * 100);

/** SIN tax suggestion for a county in the configured list: cents/gallon × gallons in the order. */
export function suggestSinTax(county: string | null | undefined, lines: Pick<SaleLine, 'volume_l' | 'quantity'>[], config: SinTaxConfig) {
  if (!county) return null;
  const entry = config.counties.find((c) => c.county.toLowerCase() === county.toLowerCase());
  if (!entry) return null;
  const liters = lines.reduce((s, l) => s + (Number(l.volume_l) || 0) * l.quantity, 0);
  const cents = Math.round((liters / 3.785411784) * entry.centsPerGallon);
  return { cents, note: entry.note, county: entry.county, centsPerGallon: entry.centsPerGallon };
}

// ─── Dates (America/New_York) + Ohio business days ────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

export function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** ET calendar date of a timestamp. */
export function dateET(iso: string): string {
  return todayET(new Date(iso));
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return ymd(new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7)));
}
function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return ymd(new Date(Date.UTC(year, month + 1, -offset)));
}
/** Fixed-date holiday observed on Fri when it falls on Sat, Mon when on Sun. */
function observed(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  else if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return ymd(d);
}

/** Ohio state holidays (ORC 124.19 — the 11 paid holidays), observed dates. */
export function ohioHolidays(year: number): Map<string, string> {
  return new Map([
    [observed(year, 0, 1), "New Year's Day"],
    [nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day'],
    [nthWeekday(year, 1, 1, 3), "Presidents' Day"],
    [lastWeekday(year, 4, 1), 'Memorial Day'],
    [observed(year, 5, 19), 'Juneteenth'],
    [observed(year, 6, 4), 'Independence Day'],
    [nthWeekday(year, 8, 1, 1), 'Labor Day'],
    [nthWeekday(year, 9, 1, 2), 'Columbus Day'],
    [observed(year, 10, 11), 'Veterans Day'],
    [nthWeekday(year, 10, 4, 4), 'Thanksgiving'],
    [observed(year, 11, 25), 'Christmas Day'],
  ]);
}

export function isBusinessDay(date: string): boolean {
  const d = parse(date);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const y = d.getUTCFullYear();
  return !ohioHolidays(y).has(date) && !ohioHolidays(y + 1).has(date);
}

/** The Nth business day after `from` (from itself doesn't count). */
export function addBusinessDays(from: string, n: number): string {
  const d = parse(from);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(ymd(d))) left--;
  }
  return ymd(d);
}

export function addDays(from: string, n: number): string {
  const d = parse(from);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

/** Business days strictly after `from` up to and including `to`. */
export function businessDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let count = 0;
  const d = parse(from);
  while (ymd(d) < to) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(ymd(d))) count++;
  }
  return count;
}

export const TASTING_NOTICE_BUSINESS_DAYS = 10;
export const TASTING_MAX_MINUTES = 120;

export const earliestTastingDate = (filedOn: string) => addBusinessDays(filedOn, TASTING_NOTICE_BUSINESS_DAYS);

export function fmtDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!date) return '';
  return parse(date).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

/** "Tue Dec 1" */
export const fmtShortDay = (date: string) => fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET';
}

export const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** "3:00 PM" */
export function fmtTime(t: string): string {
  const mins = minutesOf(t);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

// ─── Validation flags ─────────────────────────────────────────────────────────

export interface Flag {
  code: string;
  label: string;
  detail: string;
}

export function wholesaleFlags(sale: Sale, ctx: { products: Map<string, Product & { delisted?: boolean }>; verifiedPermits: Set<string>; others: Sale[] }): Flag[] {
  const flags: Flag[] = [];
  for (const l of sale.lines) {
    const p = ctx.products.get(l.brand_code);
    if (!p) {
      flags.push({ code: 'unknown_code', label: 'Unknown brand code', detail: `${l.brand_code} is not in the price book` });
    } else if (p.delisted) {
      flags.push({ code: 'delisted', label: 'Delisted brand code', detail: `${l.brand_code} ${p.name} is delisted` });
    } else if (p.priceCents !== l.price_cents) {
      flags.push({
        code: 'price_mismatch', label: 'Price doesn’t match price book',
        detail: `${l.brand_code} billed ${fmtCents(l.price_cents)}/bottle, price book ${fmtCents(p.priceCents)}`,
      });
    }
  }
  if (sale.status !== 'draft' && sale.status !== 'awaiting_customer') {
    if (!sale.a3a_signature) flags.push({ code: 'missing_signature', label: 'Missing signature', detail: 'No A-3a signature' });
    if (!sale.customer_signature) flags.push({ code: 'missing_signature', label: 'Missing signature', detail: 'No customer signature' });
  }
  if (!sale.permit_number || !ctx.verifiedPermits.has(sale.permit_number)) {
    flags.push({ code: 'permit_not_found', label: 'Permit not found', detail: `Permit ${sale.permit_number || '(blank)'} isn’t on file — verify` });
  }
  const dup = ctx.others.find((o) => o.id !== sale.id && ['submitted', 'processed'].includes(o.status)
    && o.permit_number === sale.permit_number && o.sales_date === sale.sales_date && o.total_cents === sale.total_cents);
  if (dup) flags.push({ code: 'duplicate', label: 'Possible duplicate', detail: `Same permit, date and total as ${dup.ref_no}` });
  return flags;
}

export function tastingFlags(t: Tasting, others: Tasting[]): Flag[] {
  const flags: Flag[] = [];
  const filed = dateET(t.submitted_at);
  const earliest = earliestTastingDate(filed);
  if (t.event_date < earliest) {
    flags.push({
      code: 'short_notice', label: 'Less than 10 business days notice',
      detail: `Filed ${fmtDate(filed)} for ${fmtDate(t.event_date)} (${businessDaysBetween(filed, t.event_date)} business days; earliest allowed ${fmtShortDay(earliest)})`,
    });
  }
  const dur = minutesOf(t.end_time) - minutesOf(t.start_time);
  if (dur > TASTING_MAX_MINUTES) flags.push({ code: 'over_2h', label: 'Over 2 hours', detail: `${fmtTime(t.start_time)}–${fmtTime(t.end_time)} is ${(dur / 60).toFixed(1)} hours` });
  if (dur <= 0) flags.push({ code: 'bad_time', label: 'End before start', detail: 'The event must end after it begins' });
  if (t.reg_expires && t.reg_expires < t.event_date) {
    flags.push({ code: 'reg_expired', label: 'Registration expired', detail: `Solicitor registration ${t.solicitor_reg_no ?? ''} expires ${fmtDate(t.reg_expires)}, before the event` });
  }
  if (t.applicant_type === 'trade_marketing' && !t.training_confirmed) {
    flags.push({ code: 'training', label: 'Training not confirmed', detail: 'ORC 4301.253 training box not checked' });
  }
  const s = minutesOf(t.start_time), e = minutesOf(t.end_time);
  const clash = others.find((o) => o.id !== t.id && o.status !== 'rejected' && o.agency_id === t.agency_id && o.event_date === t.event_date
    && minutesOf(o.start_time) < e && s < minutesOf(o.end_time));
  if (clash) {
    flags.push({
      code: 'conflict', label: 'Conflict at this agency',
      detail: `${clash.supplier_name} ${clash.ref_no} is ${fmtTime(clash.start_time)}–${fmtTime(clash.end_time)} the same day (${TASTING_STATUS_LABEL[clash.status].toLowerCase()})`,
    });
  }
  return flags;
}

// ─── Signatures ───────────────────────────────────────────────────────────────

/** SVG path data for a signature, scaled to fit `width` (keeps aspect). */
export function signaturePath(sig: Signature, width = sig.w): { d: string; height: number; scale: number } {
  const scale = width / sig.w;
  const d = sig.strokes.map((s) => {
    if (s.length === 1) {
      const [x, y] = s[0];
      return `M${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)} l0.1 0.1`;
    }
    return s.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * scale).toFixed(1)} ${(y * scale).toFixed(1)}`).join(' ');
  }).join(' ');
  return { d, height: sig.h * scale, scale };
}

export const isSignature = (v: unknown): v is Signature =>
  !!v && typeof v === 'object' && Array.isArray((v as Signature).strokes) && (v as Signature).strokes.some((s) => s.length > 0)
  && Number((v as Signature).w) > 0 && Number((v as Signature).h) > 0;

/** Short device description from a user agent: "iPhone · Safari". */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'Computer';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${device} · ${browser}`;
}
