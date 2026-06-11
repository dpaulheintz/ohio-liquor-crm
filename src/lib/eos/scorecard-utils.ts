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

export function formatValue(value: string | null | undefined, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (type) {
    case 'currency': {
      const n = parseFloat(value);
      if (isNaN(n)) return value;
      return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    case 'percentage':
      return value + '%';
    case 'decimal': {
      const n = parseFloat(value);
      if (isNaN(n)) return value;
      return parseFloat(n.toFixed(2)).toString();
    }
    case 'number': {
      const n = parseFloat(value);
      if (isNaN(n)) return value;
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
  const v = parseFloat(value);
  const g = parseFloat(goalValue);
  if (isNaN(v) || isNaN(g)) return false;
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

function numericValues(entries: EntryLike[]): number[] {
  return entries
    .filter(e => e.value !== null && e.value !== undefined && e.value !== '')
    .map(e => parseFloat(e.value!))
    .filter(n => !isNaN(n));
}

export function calculateAverage(entries: EntryLike[], metricType: string): string {
  if (metricType === 'boolean') return '—';
  const nums = numericValues(entries);
  if (nums.length === 0) return '—';
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return formatValue(avg.toString(), metricType);
}

export function calculateTotal(entries: EntryLike[], metricType: string): string {
  if (metricType === 'boolean' || metricType === 'decimal' || metricType === 'percentage') {
    return calculateAverage(entries, metricType);
  }
  const nums = numericValues(entries);
  if (nums.length === 0) return '—';
  const total = nums.reduce((a, b) => a + b, 0);
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
