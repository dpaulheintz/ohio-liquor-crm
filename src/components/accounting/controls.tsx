'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { periodLabel } from '@/lib/fin/shared';

/** Month picker that keeps the other query params. */
export function MonthPicker({ periods, value, statuses }: { periods: string[]; value: string; statuses: Record<string, 'open' | 'closed'> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <select
      aria-label="Month"
      value={value.slice(0, 7)}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set('m', e.target.value);
        router.push(`${pathname}?${p.toString()}`);
      }}
      className="h-10 rounded-md border bg-background px-2 text-sm"
    >
      {[...periods].reverse().map((p) => (
        <option key={p} value={p.slice(0, 7)}>{periodLabel(p, 'long')}{statuses[p] === 'open' ? ' — open' : ''}</option>
      ))}
    </select>
  );
}

/** Segmented links that set one query param. */
export function Segments({ name, value, options }: { name: string; value: string; options: { value: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex rounded-md border p-0.5" role="group" aria-label={name}>
      {options.map((o) => {
        const p = new URLSearchParams(params.toString());
        p.set(name, o.value);
        return (
          <Link key={o.value} href={`${pathname}?${p.toString()}`} aria-pressed={value === o.value} scroll={false}
            className={cn('rounded px-2.5 py-1 text-xs font-medium', value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
