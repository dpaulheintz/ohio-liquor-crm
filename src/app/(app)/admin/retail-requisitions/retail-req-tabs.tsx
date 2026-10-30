'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RETAIL_REQ_PATH } from '@/lib/retail-requisitions';

const TABS = [
  { href: `${RETAIL_REQ_PATH}/new`, label: 'New Requisition' },
  { href: RETAIL_REQ_PATH, label: 'History' },
  { href: `${RETAIL_REQ_PATH}/sku-list`, label: 'SKU List', adminOnly: true },
];

const SECTIONS = ['new', 'sku-list'];

export function RetailReqTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const sub = pathname.slice(RETAIL_REQ_PATH.length + 1).split('/')[0];
  // Viewing a saved requisition (/retail-requisitions/<id>) belongs to History.
  const active = SECTIONS.includes(sub) ? `${RETAIL_REQ_PATH}/${sub}` : RETAIL_REQ_PATH;

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
