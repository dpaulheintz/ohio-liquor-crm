import { redirect } from 'next/navigation';
import { getWholesaleAccess } from '@/lib/wholesale-forms-server';
import { WholesaleTabs } from './wholesale-tabs';

export const metadata = { title: 'Wholesale Forms | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function WholesaleFormsLayout({ children }: { children: React.ReactNode }) {
  const access = await getWholesaleAccess();
  if (!access.canUse) redirect('/');

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 pt-5">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Wholesale Forms</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
            Grandview · Gahanna · Westerville · direct wholesale sales reports
          </p>
          <WholesaleTabs isAdmin={access.isAdmin} />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">{children}</div>
    </div>
  );
}
