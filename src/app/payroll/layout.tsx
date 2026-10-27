import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { getPayrollAccess } from '@/lib/payroll/server';
import { isEosOnly } from '@/lib/eos-auth';
import { PayrollTabs } from './payroll-tabs';

export const metadata: Metadata = { title: 'Payroll | High Bank' };
export const dynamic = 'force-dynamic';

// Payroll lives outside the (app) group so EOS-only users with payroll_access (Jeff) can reach it.
export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const access = await getPayrollAccess();
  if (!access.userId) redirect('/login');
  if (!access.allowed) redirect('/');
  const backHref = isEosOnly(access.email) ? '/eos' : '/';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0">
                <ArrowLeft className="h-3.5 w-3.5" /> {backHref === '/eos' ? 'EOS' : 'CRM'}
              </Link>
              <h1 className="font-serif text-2xl font-bold tracking-wide truncate">Payroll</h1>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground shrink-0">
              <Lock className="h-3 w-3" /> Restricted · payroll access only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">Toast → Paycom</p>
          <PayrollTabs />
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
