import { List } from 'lucide-react';
import { getProducts } from '@/lib/ohlq-demo/server';
import { fmtCents } from '@/lib/ohlq-demo/shared';
import { Section } from '@/components/ohlq-demo/ui';

export default async function BrandMasterPage() {
  const products = await getProducts();
  return (
    <>
      <h1 className="ohlq-title">Brand Master</h1>
      <Section icon={<List aria-hidden />} title={`High Bank Distillery products (${products.length})`}>
        <p className="ohlq-help" style={{ marginTop: 0 }}>The price list Direct Wholesale Sales and Tasting Applications draw from. Delisted items are hidden.</p>
        <div className="ohlq-table-wrap">
          <table className="ohlq-table">
            <thead><tr><th>Code</th><th>Product</th><th>Size</th><th className="num">Wholesale</th><th className="num">Retail</th><th>Status</th></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.code}><td><b>{p.code}</b></td><td>{p.name}</td><td>{p.size}</td><td className="num">{fmtCents(p.priceCents)}</td><td className="num">{fmtCents(p.retailCents)}</td><td>{p.status}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
