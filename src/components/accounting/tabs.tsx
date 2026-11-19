'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ACCOUNTING_PATH } from '@/lib/fin/shared';

const TABS = [
  { href: ACCOUNTING_PATH, label: 'Overview' },
  { href: `${ACCOUNTING_PATH}/pnl`, label: 'P&L' },
  { href: `${ACCOUNTING_PATH}/location`, label: 'Locations' },
  { href: `${ACCOUNTING_PATH}/flags`, label: 'Flags' },
  { href: `${ACCOUNTING_PATH}/checklist`, label: 'Close Checklist' },
  { href: `${ACCOUNTING_PATH}/cross-checks`, label: 'Cross-checks' },
  { href: `${ACCOUNTING_PATH}/upload`, label: 'Upload' },
  { href: `${ACCOUNTING_PATH}/settings`, label: 'Settings' },
];

export function AccountingTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const m = params.get('m');
  const sub = pathname.slice(ACCOUNTING_PATH.length + 1).split('/')[0];
  const active = sub ? `${ACCOUNTING_PATH}/${sub === 'account' ? 'pnl' : sub}` : ACCOUNTING_PATH;
  return (
    <nav className="-mb-px mt-4 flex gap-1 overflow-x-auto" aria-label="Accounting">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={m ? `${t.href}?m=${m}` : t.href}
          aria-current={active === t.href ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            active === t.href ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
