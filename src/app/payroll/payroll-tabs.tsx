'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/payroll', label: 'Runs', match: (p: string) => p === '/payroll' || p.startsWith('/payroll/runs') },
  { href: '/payroll/employees', label: 'Employees' },
  { href: '/payroll/jobs', label: 'Jobs' },
  { href: '/payroll/paycodes', label: 'Pay Codes' },
  { href: '/payroll/locations', label: 'Locations' },
  { href: '/payroll/template', label: 'Output Template' },
  { href: '/payroll/settings', label: 'Settings' },
  { href: '/payroll/examples', label: 'Examples' },
  { href: '/payroll/audit', label: 'Audit Log' },
];

export function PayrollTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 mt-3 -mb-px overflow-x-auto">
      {TABS.map((t) => {
        const active = t.match ? t.match(pathname) : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
              active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
