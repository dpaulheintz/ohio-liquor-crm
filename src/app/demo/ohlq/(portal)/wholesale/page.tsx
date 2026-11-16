import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { getSales } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, PARTNER, fmtCents, fmtDate } from '@/lib/ohlq-demo/shared';
import { SaleStatusChip, Section } from '@/components/ohlq-demo/ui';
import { RowLink } from '@/components/ohlq-demo/row-link';

export default async function WholesaleList() {
  const sales = (await getSales()).filter((s) => s.supplier_name === PARTNER.name);
  return (
    <>
      <h1 className="ohlq-title">Direct Wholesale Sales</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p className="ohlq-help" style={{ margin: 0, maxWidth: 640 }}>
          A-3a direct sales to wholesale customers. Prices come straight from your OHLQ price list, both parties sign on screen, and OHLQ receives the data — no retyping.
        </p>
        <Link href={`${DEMO_BASE}/wholesale/new`} className="ohlq-btn"><Plus aria-hidden /> New Direct Sale</Link>
      </div>
      <Section icon={<Receipt aria-hidden />} title={`Sales (${sales.length})`}>
        {sales.length === 0 ? <p className="ohlq-value">No direct sales yet.</p> : (
          <div className="ohlq-table-wrap">
            <table className="ohlq-table">
              <thead><tr><th>Ref</th><th>Sales date</th><th>Customer</th><th>Permit #</th><th className="num">Bottles</th><th className="num">Invoice total</th><th>Status</th></tr></thead>
              <tbody>
                {sales.map((s) => (
                  <RowLink key={s.id} href={`${DEMO_BASE}/wholesale/${s.id}`}>
                    <td><Link href={`${DEMO_BASE}/wholesale/${s.id}`} style={{ color: 'var(--ohlq-red)' }}>{s.ref_no}</Link></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.sales_date)}</td>
                    <td>{s.customer_dba || s.customer_name}{s.customer_dba && <div className="ohlq-help" style={{ marginTop: 0 }}>{s.customer_name}</div>}</td>
                    <td>{s.permit_number}</td>
                    <td className="num">{s.lines.reduce((n, l) => n + l.quantity, 0)}</td>
                    <td className="num">{fmtCents(s.total_cents)}</td>
                    <td><SaleStatusChip status={s.status} /></td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
