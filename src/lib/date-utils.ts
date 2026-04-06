/**
 * Convert a UTC date string to an EST/EDT-aware Date for display.
 * Uses the Intl API (no extra dependencies).
 */
export function toZonedTime(date: string | Date): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Get the offset between UTC and America/New_York
  const utc = d.getTime();
  const eastern = new Date(utc).toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(eastern);
}

/**
 * Format a UTC date string to a readable EST string.
 */
export function formatEST(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    ...options,
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
