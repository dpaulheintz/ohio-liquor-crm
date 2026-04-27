import { formatDistanceToNow } from 'date-fns';

/**
 * Format a UTC date string as "Monday, April 13 (2 days ago)" in EST.
 */
export function formatVisitDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dayName = d.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York',
  });
  const monthDay = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
  const relative = formatDistanceToNow(d, { addSuffix: true });
  return `${dayName}, ${monthDay} (${relative})`;
}

/**
 * Returns a section group label for a visit date.
 * Groups: "This Week", "Last Week", then by month ("March 2026").
 */
export function getVisitGroup(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Use a local-time approximation in EST for grouping.
  // toLocaleString gives us the wall-clock string; we parse just the date part.
  const toESTDate = (dt: Date) => {
    const s = dt.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [m, dy, y] = s.split('/').map(Number);
    return new Date(y, m - 1, dy); // midnight local
  };

  const today = toESTDate(new Date());
  const visitDay = toESTDate(d);

  // Sunday of the current week
  const thisWeekSunday = new Date(today);
  thisWeekSunday.setDate(today.getDate() - today.getDay());

  // Sunday of last week
  const lastWeekSunday = new Date(thisWeekSunday);
  lastWeekSunday.setDate(thisWeekSunday.getDate() - 7);

  if (visitDay >= thisWeekSunday) return 'This Week';
  if (visitDay >= lastWeekSunday) return 'Last Week';

  return d.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/**
 * Get current date/time as a datetime-local string in EST.
 */
export function nowESTDatetimeLocal(): string {
  const now = new Date();
  const estString = now.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // Parse "MM/DD/YYYY, HH:MM" into "YYYY-MM-DDTHH:MM"
  const match = estString.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (!match) return now.toISOString().slice(0, 16);
  const [, mm, dd, yyyy, hh, min] = match;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
