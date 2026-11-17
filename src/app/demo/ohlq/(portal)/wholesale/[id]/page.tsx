import { notFound } from 'next/navigation';
import { getAgencies, getAudit, getCustomers, getMessages, getProducts, getSale, getSinTaxConfig } from '@/lib/ohlq-demo/server';
import { SaleWorkspace } from '@/components/ohlq-demo/sale-workspace';

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sign?: string }> }) {
  const { id } = await params;
  const { sign } = await searchParams;
  const sale = await getSale(id);
  if (!sale) notFound();
  const [products, customers, agencies, sinConfig, audit, messages] = await Promise.all([getProducts(), getCustomers(), getAgencies(), getSinTaxConfig(), getAudit('wholesale', id), getMessages('wholesale', id)]);
  const counties = [...new Set(agencies.map((a) => a.county).filter((c): c is string => !!c))].sort();
  return (
    <SaleWorkspace key={`${sale.id}-${sale.status}`} sale={sale} products={products} customers={customers} counties={counties}
      sinConfig={sinConfig} audit={audit} messages={messages} initialDialog={sign === 'a3a' || sign === 'send' ? sign : null} />
  );
}
