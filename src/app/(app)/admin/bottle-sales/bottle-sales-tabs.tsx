'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BOTTLE_SALES_PATH } from '@/lib/bottle-sales';

const TABS = [
  { href: BOTTLE_SALES_PATH, label: 'Dashboard' },
  { href: `${BOTTLE_SALES_PATH}/log`, label: 'Log Sales' },
  { href: `${BOTTLE_SALES_PATH}/entries`, label: 'Entries' },
  { href: `${BOTTLE_SALES_PATH}/products`, label: 'Products' },
  { href: `${BOTTLE_SALES_PATH}/notes`, label: 'Old Spreadsheet Notes' },
];

export function BottleSalesTabs() {
  const pathname = usePathname();
  const sub = pathname.slice(BOTTLE_SALES_PATH.length + 1).split('/')[0];
  const active = sub ? `${BOTTLE_SALES_PATH}/${sub}` : BOTTLE_SALES_PATH;
  return (
    <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
            active === t.href ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
