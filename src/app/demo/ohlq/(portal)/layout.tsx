import { db } from '@/lib/ohlq-demo/server';
import { PortalShell } from '@/components/ohlq-demo/shell';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [w, t] = await Promise.all([
    db().from('ohlq_demo_wholesale_sales').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    db().from('ohlq_demo_tastings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
  ]);
  return <PortalShell opsCounts={{ wholesale: w.count ?? 0, tastings: t.count ?? 0 }}>{children}</PortalShell>;
}
