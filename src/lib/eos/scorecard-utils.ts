export function getWeekStarts(count: number): string[] {
  const weeks: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysToMonday);
  thisMonday.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() - i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    weeks.push(`${y}-${m}-${day}`);
  }
  return weeks;
}

/**
 * Parses a typed scorecard value into a number, or null if it isn't one (empty input is null too).
 * Strips $, % and spaces. "10,100" and "$8,000.50" use the comma as a thousands separator; for
 * percentage/decimal metrics a single comma followed by 1–2 digits is a decimal point ("21,8" → 21.8).
 */
export function parseScorecardValue(raw: string | null | undefined, metricType: string): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[$%\s\u00a0]/g, '');
  if (s === '') return null;
  let clean: string;
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) clean = s;
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) clean = s.replace(/,/g, '');
  else if ((metricType === 'percentage' || metricType === 'decimal') && /^-?\d+,\d{1,2}$/.test(s)) clean = s.replace(',', '.');
  else return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** The value to store for a typed entry: a plain number string, '' for empty, or null if it isn't valid. */
export function normalizeScorecardValue(raw: string, metricType: string): string | null {
  const t = raw.trim();
  if (t === '') return '';
  if (metricType === 'boolean') return t === 'true' || t === 'false' ? t : null;
  const n = parseScorecardValue(t, metricType);
  return n === null ? null : String(n);
}

export function formatValue(value: string | null | undefined, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': {
      const n = parseScorecardValue(value, type);
      if (n === null) return value;
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case 'percentage': {
      const n = parseScorecardValue(value, type);
      if (n === null) return value;
      return parseFloat(n.toFixed(2)).toString() + '%';
    }
    case 'decimal': {
      const n = parseScorecardValue(value, type);
      if (n === null) return value;
      return parseFloat(n.toFixed(2)).toString();
    }
    case 'number': {
      const n = parseScorecardValue(value, type);
      if (n === null) return value;
      return Math.round(n).toLocaleString('en-US');
    }
    case 'boolean':
      return value === 'true' ? 'Yes' : value === 'false' ? 'No' : '—';
    default:
      return value;
  }
}

export function formatOperator(op: string): string {
  if (op === '>=') return '≥';
  if (op === '<=') return '≤';
  return op;
}

export function evaluateGoal(
  value: string,
  operator: string,
  goalValue: string,
  type: string,
): boolean {
  if (!value || value === '') return false;
  if (type === 'boolean') {
    return value === goalValue;
  }
  const v = parseScorecardValue(value, type);
  const g = parseScorecardValue(goalValue, type);
  if (v === null || g === null) return false;
  switch (operator) {
    case '>=': return v >= g;
    case '<=': return v <= g;
    case '>':  return v > g;
    case '<':  return v < g;
    case '=':  return v === g;
    default:   return false;
  }
}

type EntryLike = { value: string | null | undefined };

function numericValues(entries: EntryLike[], metricType: string): number[] {
  return entries
    .map(e => parseScorecardValue(e.value, metricType))
    .filter((n): n is number => n !== null);
}

export function calculateAverage(entries: EntryLike[], metricType: string): string {
  if (metricType === 'boolean') return '—';
  const nums = numericValues(entries, metricType);
  if (nums.length === 0) return '—';
  const avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  return formatValue(avg.toString(), metricType);
}

export function calculateTotal(entries: EntryLike[], metricType: string): string {
  if (metricType === 'boolean' || metricType === 'decimal' || metricType === 'percentage') {
    return calculateAverage(entries, metricType);
  }
  const nums = numericValues(entries, metricType);
  if (nums.length === 0) return '—';
  const total = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
  return formatValue(total.toString(), metricType);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatWeekHeader(weekStart: string, currentYear: number): string {
  // weekStart is YYYY-MM-DD (Monday)
  const parts = weekStart.split('-').map(Number);
  const monday = new Date(parts[0], parts[1] - 1, parts[2]);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startMonth = MONTHS[monday.getMonth()];
  const startDay = monday.getDate();
  const endMonth = MONTHS[sunday.getMonth()];
  const endDay = sunday.getDate();
  const year = monday.getFullYear();
  const yearSuffix = year !== currentYear ? ` '${String(year).slice(2)}` : '';

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}${yearSuffix}`;
  }
  return `${startMonth} ${startDay}–${endMonth} ${endDay}${yearSuffix}`;
}
