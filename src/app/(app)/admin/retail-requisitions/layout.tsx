import { redirect } from 'next/navigation';
import { getRetailReqAccess } from '@/lib/retail-requisitions-server';
import { RetailReqTabs } from './retail-req-tabs';

export const metadata = { title: 'Retail Requisitions | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function RetailRequisitionsLayout({ children }: { children: React.ReactNode }) {
  const access = await getRetailReqAccess();
  if (!access.canUse) redirect('/');

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 pt-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Retail Requisitions</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">Grandview · Gahanna · Westerville</p>
          <RetailReqTabs isAdmin={access.isAdmin} />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">{children}</div>
    </div>
  );
}
