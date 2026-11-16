import { getAgencies, getCustomers, getProducts, getSinTaxConfig } from '@/lib/ohlq-demo/server';
import { SaleWorkspace } from '@/components/ohlq-demo/sale-workspace';

export default async function NewSalePage() {
  const [products, customers, agencies, sinConfig] = await Promise.all([getProducts(), getCustomers(), getAgencies(), getSinTaxConfig()]);
  const counties = [...new Set(agencies.map((a) => a.county).filter((c): c is string => !!c))].sort();
  return <SaleWorkspace sale={null} products={products} customers={customers} counties={counties} sinConfig={sinConfig} audit={[]} />;
}
