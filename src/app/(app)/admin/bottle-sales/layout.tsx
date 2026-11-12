import { redirect } from 'next/navigation';
import { getBottleSalesAccess } from '@/lib/bottle-sales-server';
import { BottleSalesTabs } from './bottle-sales-tabs';

export const metadata = { title: 'Bottle Sales | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function BottleSalesLayout({ children }: { children: React.ReactNode }) {
  const access = await getBottleSalesAccess();
  if (!access.canUse) redirect('/');

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 pt-5">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Bottle Sales</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">Grandview · Gahanna · Westerville · PO Box 21</p>
          <BottleSalesTabs />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">{children}</div>
    </div>
  );
}
