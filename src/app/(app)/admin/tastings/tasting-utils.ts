import type { TastingStatus } from '@/lib/types';

export interface StatusConfig {
  label: string;
  className: string;
  dotClass: string;
}

export function statusConfig(status: string): StatusConfig {
  switch (status) {
    case 'needs_staff':
      return {
        label: 'Needs Staff',
        className:
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        dotClass: 'bg-red-500',
      };
    case 'scheduled':
      return {
        label: 'Scheduled',
        className:
          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        dotClass: 'bg-amber-400',
      };
    case 'staffed':
      return {
        label: 'Staffed',
        className:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        dotClass: 'bg-emerald-500',
      };
    case 'completed':
      return {
        label: 'Completed',
        className:
          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        dotClass: 'bg-gray-400',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className:
          'bg-gray-100 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-600',
        dotClass: 'bg-gray-300',
      };
    default:
      return { label: status, className: '', dotClass: 'bg-gray-400' };
  }
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Add `hours` to a "HH:MM" string, returns new "HH:MM" */
export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function deriveStatus(
  staffCategory: string,
  staffPerson: string
): TastingStatus {
  if (staffPerson.trim()) return 'staffed';
  if (staffCategory) return 'scheduled';
  return 'needs_staff';
}
