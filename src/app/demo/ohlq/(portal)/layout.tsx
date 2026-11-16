import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasDemoAccess } from '@/lib/ohlq-demo/access-token';
import { db } from '@/lib/ohlq-demo/server';
import { ACCESS_COOKIE, DEMO_BASE } from '@/lib/ohlq-demo/shared';
import { PortalShell } from '@/components/ohlq-demo/shell';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // The proxy already gates /demo/ohlq; this is the belt to its braces.
  if (!(await hasDemoAccess((await cookies()).get(ACCESS_COOKIE)?.value))) redirect(`${DEMO_BASE}/access`);
  const [w, t] = await Promise.all([
    db().from('ohlq_demo_wholesale_sales').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    db().from('ohlq_demo_tastings').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
  ]);
  return <PortalShell opsCounts={{ wholesale: w.count ?? 0, tastings: t.count ?? 0 }}>{children}</PortalShell>;
}
