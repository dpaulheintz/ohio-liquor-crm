// Exact payroll units. Money is integer cents; hours are integer hundredths ("hh", 40.00 h = 4000).
// Values are parsed from text digit-by-digit, never through floating point.

export interface Parsed {
  value: number | null;
  /** True when the source had more precision than we store and was rounded half-up. */
  rounded: boolean;
  invalid: boolean;
}

const EMPTY: Parsed = { value: null, rounded: false, invalid: false };

/** Parses "1,234.567", "$12.50", "(3.25)", "-4" into an integer scaled by 10^places. */
function parseScaled(raw: string | null | undefined, places: number): Parsed {
  if (raw == null) return EMPTY;
  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '—') return EMPTY;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = s.match(/^(\d*)(?:\.(\d*))?$/);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { value: null, rounded: false, invalid: true };
  const whole = m[1] || '0';
  const frac = m[2] ?? '';
  const kept = frac.slice(0, places).padEnd(places, '0');
  let value = Number(whole) * 10 ** places + Number(kept || '0');
  let rounded = false;
  if (frac.length > places) {
    rounded = /[1-9]/.test(frac.slice(places));
    if (Number(frac[places]) >= 5) value += 1;
  }
  if (!Number.isSafeInteger(value)) return { value: null, rounded: false, invalid: true };
  return { value: negative ? -value : value, rounded, invalid: false };
}

export function parseCents(raw: string | null | undefined): Parsed {
  return parseScaled(raw, 2);
}

/** Hours as decimal ("38.25") or clock time ("38:15"). */
export function parseHundredthsOfHour(raw: string | null | undefined): Parsed {
  if (raw == null) return EMPTY;
  const s = String(raw).trim();
  const clock = s.match(/^(-)?(\d+):([0-5]\d)$/);
  if (clock) {
    const minutes = Number(clock[2]) * 60 + Number(clock[3]);
    // hh = minutes * 100 / 60, rounded half-up in integer math.
    const hh = Math.floor((minutes * 100 * 2 + 60) / 120);
    return { value: clock[1] ? -hh : hh, rounded: (minutes * 100) % 60 !== 0, invalid: false };
  }
  return parseScaled(s, 2);
}

/** Round-half-up integer division for non-negative numerators; symmetric for negatives. */
export function divRound(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/** hours (hh) × rate (cents/hour) → cents, half-up. */
export function hoursTimesRate(hh: number, rateCents: number): number {
  return divRound(hh * rateCents, 100);
}

/** OT pay at 1.5× the base rate: hh × rate × 3 / 200, half-up. */
export function overtimePay(hh: number, rateCents: number): number {
  return divRound(hh * rateCents * 3, 200);
}

/**
 * OT pay for a tip-credit employee: 1.5 × minimum wage minus the tip credit (minimum − cash rate),
 * i.e. hh × (rate + min / 2). When the cash rate is at or above minimum there's no tip credit, so 1.5× rate.
 */
export function tippedOvertimePay(hh: number, rateCents: number, minWageCents: number): number {
  if (rateCents >= minWageCents) return overtimePay(hh, rateCents);
  return divRound(hh * (2 * rateCents + minWageCents), 200);
}

function fmtScaled(v: number, places: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  const scale = 10 ** places;
  return `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(places, '0')}`;
}

/** 123456 → "1234.56" (for files). */
export function centsPlain(c: number): string {
  return fmtScaled(c, 2);
}

/** 123456 → "$1,234.56" (for screens). */
export function centsDisplay(c: number): string {
  const s = fmtScaled(Math.abs(c), 2);
  const [w, f] = s.split('.');
  return `${c < 0 ? '-' : ''}$${w.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
}

/** 3825 → "38.25" */
export function hoursPlain(hh: number): string {
  return fmtScaled(hh, 2);
}

// ─── Dates ("YYYY-MM-DD" strings; arithmetic in UTC so no time zone can shift a day) ───

export function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(ymd: string, days: number): string {
  return utcToYmd(ymdToUtc(ymd) + days * 86_400_000);
}

/** Start of the workweek containing `ymd`, where weeks start on `startDow` (0 = Sunday). */
export function weekStart(ymd: string, startDow: number): string {
  const dow = new Date(ymdToUtc(ymd)).getUTCDay();
  return addDays(ymd, -((dow - startDow + 7) % 7));
}

/** Parses common export date forms into "YYYY-MM-DD"; null if unrecognized. */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** Formats "YYYY-MM-DD" with tokens YYYY, YY, MM, M, DD, D. */
export function formatDate(ymd: string, pattern: string): string {
  const [y, m, d] = ymd.split('-');
  return pattern.replace(/YYYY|YY|MM|M|DD|D/g, (t) => ({
    YYYY: y, YY: y.slice(-2), MM: m, M: String(Number(m)), DD: d, D: String(Number(d)),
  })[t]!);
}

/** "2026-10-05" → "Oct 5, 2026" (built from parts, never parsed as UTC). */
export function displayDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
