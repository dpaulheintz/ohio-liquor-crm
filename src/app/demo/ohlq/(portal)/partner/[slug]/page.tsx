import Link from 'next/link';
import { Briefcase, Construction } from 'lucide-react';
import { DEMO_BASE, PARTNER } from '@/lib/ohlq-demo/shared';
import { Section } from '@/components/ohlq-demo/ui';

const TITLES: Record<string, string> = {
  'partner-info': 'Partner Info', 'coverage-requests': 'Coverage Requests', 'distribution-center': 'Distribution Center',
  'price-calculator': 'Price Calculator', products: 'Products', 'product-actions': 'Product Actions', 'product-transfers': 'Product Transfers',
  'purchase-requisitions': 'Purchase Requisitions', 'push-management': 'Push Management', 'agency-list': 'Agency List',
  'data-downloads': 'Data Downloads', 'dc-aged-inventory': 'DC Aged Inventory',
};

export default async function PartnerPlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = TITLES[slug] ?? 'Partner Portal';
  return (
    <>
      <h1 className="ohlq-title">{title}</h1>
      {slug === 'partner-info' && (
        <Section icon={<Briefcase aria-hidden />} title="Business Information">
          <div className="grid gap-4 sm:grid-cols-2">
            {[['Name', PARTNER.name], ['Vendor #', PARTNER.vendorNumber], ['Address', PARTNER.address], ['City / State / ZIP', `${PARTNER.city}, OH ${PARTNER.zip}`], ['Phone', PARTNER.phone], ['Email', PARTNER.email]].map(([l, v]) => (
              <div key={l}><span className="ohlq-label">{l}</span><input className="ohlq-input" readOnly value={v} /></div>
            ))}
          </div>
          <p className="ohlq-help">Direct Wholesale Sales fills the A-3a section from here automatically.</p>
        </Section>
      )}
      <div className="ohlq-card" style={{ textAlign: 'center', padding: 32 }}>
        <Construction aria-hidden style={{ width: 36, height: 36, color: '#999', margin: '0 auto 8px' }} />
        <p className="ohlq-cond" style={{ fontSize: 22, margin: '0 0 6px' }}>Not part of this demo</p>
        <p className="ohlq-value" style={{ margin: '0 0 16px' }}>This concept covers the two new items only.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="ohlq-btn" href={`${DEMO_BASE}/wholesale`}>Direct Wholesale Sales</Link>
          <Link className="ohlq-btn" href={`${DEMO_BASE}/tastings`}>Tasting Applications</Link>
        </div>
      </div>
    </>
  );
}
