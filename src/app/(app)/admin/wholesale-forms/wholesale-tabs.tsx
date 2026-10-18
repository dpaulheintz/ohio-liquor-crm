'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { WHOLESALE_FORMS_PATH } from '@/lib/wholesale-forms';

const TABS = [
  { href: `${WHOLESALE_FORMS_PATH}/new`, label: 'New Form' },
  { href: WHOLESALE_FORMS_PATH, label: 'History' },
  { href: `${WHOLESALE_FORMS_PATH}/wholesalers`, label: 'Wholesalers' },
  { href: `${WHOLESALE_FORMS_PATH}/price-list`, label: 'Price List', adminOnly: true },
  { href: `${WHOLESALE_FORMS_PATH}/settings`, label: 'Settings', adminOnly: true },
];

const SECTIONS = ['new', 'wholesalers', 'price-list', 'settings'];

export function WholesaleTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const sub = pathname.slice(WHOLESALE_FORMS_PATH.length + 1).split('/')[0];
  // Viewing a saved form (/wholesale-forms/<id>) belongs to History.
  const active = SECTIONS.includes(sub) ? `${WHOLESALE_FORMS_PATH}/${sub}` : WHOLESALE_FORMS_PATH;

  return (
    <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
      {TABS.filter((t) => isAdmin || !t.adminOnly).map((t) => (
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
