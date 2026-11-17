import { redirect } from 'next/navigation';
import { getBottleSalesAccess, loadLocations, requireBottleSalesAccess } from '@/lib/bottle-sales-server';
import { locTag } from '@/lib/bottle-sales';
import { BottleSalesTabs } from './bottle-sales-tabs';

export const metadata = { title: 'Bottle Sales | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function BottleSalesLayout({ children }: { children: React.ReactNode }) {
  const access = await getBottleSalesAccess();
  if (!access.canUse) redirect('/');
  const locations = await loadLocations(await requireBottleSalesAccess());

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 pt-5">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Bottle Sales</h1>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-xs uppercase tracking-widest text-muted-foreground" aria-label="Locations, agency numbers and GL sales accounts">
            {locations.map((l) => <li key={l.code} className="tabular-nums">{locTag(l)}</li>)}
          </ul>
          <BottleSalesTabs />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">{children}</div>
    </div>
  );
}
