import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getAccountingAccess } from '@/lib/fin/server';
import { AccountingTabs } from '@/components/accounting/tabs';

export const metadata = { title: 'Accounting | High Bank CRM' };
export const dynamic = 'force-dynamic';

// Restricted to profiles.accounting_access (Paul + accounting@). The data itself is protected by RLS.
export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccountingAccess();
  if (!access.userId) redirect('/login');
  if (!access.allowed) redirect('/');
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 pt-5 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl font-bold tracking-wide">Accounting</h1>
            <span className="hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              <Lock className="h-3 w-3" /> Restricted · accounting access only
            </span>
          </div>
          <p className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground">P&amp;L by location · read by account and location, never by position</p>
          <AccountingTabs />
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
