import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import { getSaleByToken } from '@/lib/ohlq-demo/server';
import { PARTNER, fmtCents, fmtDate, fmtDateTime } from '@/lib/ohlq-demo/shared';
import { SignForm } from './sign-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review & sign — OHLQ concept demo', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function SignPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ inperson?: string }> }) {
  const { token } = await params;
  const inPerson = (await searchParams).inperson === '1';
  const sale = await getSaleByToken(token);

  if (!sale) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
        <div className="ohlq-card" style={{ borderTop: '5px solid var(--ohlq-red)' }}>
          <h1 className="ohlq-cond" style={{ fontSize: 24, margin: 0 }}>Link not valid</h1>
          <p className="ohlq-value">This signing link is no longer valid. Ask {PARTNER.name} to send a new one.</p>
        </div>
      </main>
    );
  }

  const bottles = sale.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '14px 14px calc(28px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Image src="/demo/ohlq/ohlq-logo.png" alt="OHLQ Ohio Liquor" width={110} height={44} style={{ height: 40, width: 'auto' }} />
        <span className="ohlq-cond" style={{ fontSize: 14, color: '#555', lineHeight: 1.2 }}>Direct Sale to<br />Wholesale Customer</span>
      </div>
      {inPerson && (
        <div className="ohlq-warn" style={{ marginBottom: 12, fontSize: 15 }}>
          <b className="ohlq-cond" style={{ fontWeight: 500 }}>In-person signing</b> — hand this device to the customer to review and sign.
        </div>
      )}

      <section className="ohlq-card" style={{ borderTop: '5px solid var(--ohlq-red)', marginBottom: 12 }}>
        <h1 className="ohlq-cond" style={{ fontSize: 24, fontWeight: 600, margin: '0 0 2px' }}>Review your order</h1>
        <p className="ohlq-help" style={{ marginTop: 0 }}>{sale.ref_no} · Sales date {fmtDate(sale.sales_date)}</p>
        <dl className="ohlq-kv" style={{ marginTop: 12 }}>
          <dt>Sold by (A-3a)</dt><dd>{PARTNER.name}<br /><span className="ohlq-muted">{PARTNER.address}, {PARTNER.city} · {PARTNER.phone}</span></dd>
          <dt>Customer</dt><dd>{sale.customer_dba || sale.customer_name}{sale.customer_dba ? <><br /><span className="ohlq-muted">{sale.customer_name}</span></> : null}</dd>
          <dt>Permit number</dt><dd>{sale.permit_number}{sale.is_f2 ? ' (F2)' : ''}</dd>
          <dt>Address</dt><dd>{sale.customer_address}, {sale.customer_city}, OH {sale.customer_zip}</dd>
        </dl>
      </section>

      <section className="ohlq-card" style={{ marginBottom: 12, padding: 0 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sale.lines.map((l) => (
            <li key={l.id} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: '1px solid #eee' }}>
              <div style={{ flex: 1 }}>
                <div className="ohlq-value" style={{ fontWeight: 600 }}>{l.description} <span className="ohlq-muted" style={{ fontWeight: 400 }}>{l.size_label}</span></div>
                <div className="ohlq-help" style={{ marginTop: 2 }}>{l.brand_code} · {l.quantity} bottles × {fmtCents(l.price_cents)}</div>
              </div>
              <div className="ohlq-value" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtCents(l.line_total_cents)}</div>
            </li>
          ))}
          {sale.sin_tax_cents > 0 && (
            <li style={{ display: 'flex', padding: '10px 14px', borderBottom: '1px solid #eee' }} className="ohlq-value">
              <span style={{ flex: 1 }}>SIN tax</span><span>{fmtCents(sale.sin_tax_cents)}</span>
            </li>
          )}
          <li style={{ display: 'flex', padding: '14px', alignItems: 'baseline' }}>
            <span className="ohlq-cond" style={{ flex: 1, fontSize: 20, fontWeight: 600 }}>Invoice Total</span>
            <span className="ohlq-value" style={{ fontSize: 22, fontWeight: 700 }}>{fmtCents(sale.total_cents)}</span>
          </li>
        </ul>
        <p className="ohlq-help" style={{ padding: '0 14px 12px', margin: 0 }}>{bottles} bottles · prices from the OHLQ price list</p>
      </section>

      {sale.status === 'awaiting_customer' ? (
        <SignForm token={token} inPerson={inPerson} saleId={sale.id} />
      ) : sale.customer_signature ? (
        <section className="ohlq-card" style={{ borderTop: '5px solid #2c8a4b' }}>
          <h2 className="ohlq-cond" style={{ fontSize: 22, margin: '0 0 6px' }}>✓ Signed</h2>
          <p className="ohlq-value">Signed by {sale.customer_signer_name} {fmtDateTime(sale.customer_signed_at)}. Thank you — {PARTNER.name} will submit it to OHLQ.</p>
          {inPerson && <a className="ohlq-btn" href={`/demo/ohlq/wholesale/${sale.id}`} style={{ marginTop: 10 }}>Return to sale</a>}
        </section>
      ) : (
        <section className="ohlq-card"><p className="ohlq-value">This order isn&rsquo;t waiting for a signature right now.</p></section>
      )}
    </main>
  );
}
