import { notFound } from 'next/navigation';
import { Building2, FileText, History, PenLine, Receipt, ShieldCheck, Users } from 'lucide-react';
import { getAudit, getOpsData } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, PARTNER, fmtCents, fmtDate, fmtDateTime } from '@/lib/ohlq-demo/shared';
import { FlagList, SaleStatusChip, Section } from '@/components/ohlq-demo/ui';
import { SignatureView } from '@/components/ohlq-demo/signature-pad';
import { AuditList } from '@/components/ohlq-demo/sale-workspace';
import { OpsSaleActions } from '@/components/ohlq-demo/ops-actions';

export default async function OpsSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sales, book } = await getOpsData();
  const sale = sales.find((s) => s.id === id);
  if (!sale) notFound();
  const audit = await getAudit('wholesale', id);
  const priceBook = new Map(book.map((p) => [p.code, p]));
  const sigCard = (sig: typeof sale.a3a_signature, name: string | null, at: string | null, device: string | null, extra?: string) => (
    <div style={{ border: '1px solid #e3e3e3', padding: 10, background: '#fffefb' }}>
      {sig ? <SignatureView sig={sig} width={250} /> : <p className="ohlq-error">Missing</p>}
      <div className="ohlq-value" style={{ borderTop: '1px solid #ccc', marginTop: 4, paddingTop: 4 }}>{name}</div>
      <div className="ohlq-help" style={{ marginTop: 0 }}>{at ? `Signed ${fmtDateTime(at)}` : ''}{device ? ` · ${device}` : ''}{extra ? ` · ${extra}` : ''}</div>
    </div>
  );
  return (
    <>
      <h1 className="ohlq-title" style={{ marginBottom: 6 }}>Direct Sale {sale.ref_no}</h1>
      <div style={{ textAlign: 'center', marginBottom: 16 }}><SaleStatusChip status={sale.status} /></div>

      <Section icon={<ShieldCheck aria-hidden />} title="Automatic checks">
        <FlagList flags={sale.flags} />
        {sale.status === 'submitted' && <OpsSaleActions saleId={sale.id} refNo={sale.ref_no} />}
        {sale.status === 'returned' && sale.return_note && <p className="ohlq-warn">Returned to supplier: {sale.return_note}</p>}
        {sale.status === 'processed' && <p className="ohlq-value" style={{ color: '#1e6b34' }}>Processed {fmtDateTime(sale.processed_at)} — included in the CSV export.</p>}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section icon={<Building2 aria-hidden />} title="A-3a (Supplier)">
          <dl className="ohlq-kv">
            <dt>Name</dt><dd>{sale.supplier_name}</dd><dt>Vendor #</dt><dd>{PARTNER.vendorNumber}</dd>
            <dt>Address</dt><dd>{PARTNER.address}, {PARTNER.city}, OH {PARTNER.zip}</dd><dt>Phone / email</dt><dd>{PARTNER.phone} · {PARTNER.email}</dd>
          </dl>
        </Section>
        <Section icon={<Users aria-hidden />} title="Wholesale Customer">
          <dl className="ohlq-kv">
            <dt>Customer</dt><dd>{sale.customer_name}{sale.customer_dba ? <><br /><span className="ohlq-muted">DBA {sale.customer_dba}</span></> : null}</dd>
            <dt>Permit #</dt><dd><b>{sale.permit_number}</b> {sale.is_f2 ? '(F2)' : ''}</dd>
            <dt>Address</dt><dd>{sale.customer_address}, {sale.customer_city}, OH {sale.customer_zip}{sale.customer_county ? ` · ${sale.customer_county}` : ''}</dd>
            <dt>Phone</dt><dd>{sale.customer_phone || '—'}</dd>
          </dl>
        </Section>
      </div>

      <Section icon={<Receipt aria-hidden />} title={`Sale · ${fmtDate(sale.sales_date)}`}>
        <div className="ohlq-table-wrap">
          <table className="ohlq-table">
            <thead><tr><th>Brand Code</th><th>Product Name</th><th className="num">Qty</th><th className="num">Billed / bottle</th><th className="num">Price book</th><th className="num">Item Subtotal</th></tr></thead>
            <tbody>
              {sale.lines.map((l) => {
                const p = priceBook.get(l.brand_code);
                const bad = !p || p.delisted || p.priceCents !== l.price_cents;
                return (
                  <tr key={l.id} style={bad ? { background: '#fff4e5' } : undefined}>
                    <td><b>{l.brand_code}</b></td><td>{l.description} {l.size_label}</td><td className="num">{l.quantity}</td>
                    <td className="num" style={bad ? { color: 'var(--ohlq-red)', fontWeight: 700 } : undefined}>{fmtCents(l.price_cents)}</td>
                    <td className="num">{p ? fmtCents(p.priceCents) : 'not found'}{p?.delisted ? ' (delisted)' : ''}</td>
                    <td className="num">{fmtCents(l.line_total_cents)}</td>
                  </tr>
                );
              })}
              <tr><td colSpan={5} className="num">SIN tax{sale.sin_tax_note ? ` (${sale.sin_tax_note})` : ''}</td><td className="num">{fmtCents(sale.sin_tax_cents)}</td></tr>
              <tr><td colSpan={5} className="num"><b className="ohlq-cond" style={{ fontSize: 18 }}>Invoice Total</b></td><td className="num"><b>{fmtCents(sale.total_cents)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section icon={<PenLine aria-hidden />} title="Signatures">
        <div className="grid gap-4 md:grid-cols-2">
          <div><span className="ohlq-label">A-3a signature</span>{sigCard(sale.a3a_signature, `${sale.a3a_signer_name ?? ''}${sale.a3a_signer_title ? `, ${sale.a3a_signer_title}` : ''}`, sale.a3a_signed_at, sale.a3a_device)}</div>
          <div><span className="ohlq-label">Customer signature</span>{sigCard(sale.customer_signature, sale.customer_signer_name, sale.customer_signed_at, sale.customer_device, sale.customer_consent ? 'agreed to sign electronically' : undefined)}</div>
        </div>
      </Section>

      <Section icon={<FileText aria-hidden />} title="PDF (A-3a form)" defaultOpen={false}>
        <a className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" href={`${DEMO_BASE}/api/wholesale/${sale.id}/pdf`} target="_blank" rel="noreferrer">Open PDF</a>
        <iframe title={`A-3a ${sale.ref_no} PDF`} src={`${DEMO_BASE}/api/wholesale/${sale.id}/pdf`} style={{ width: '100%', height: 780, border: '1px solid #ddd', marginTop: 10 }} className="hidden md:block" />
      </Section>

      <Section icon={<History aria-hidden />} title="Audit trail"><AuditList audit={audit} /></Section>
    </>
  );
}
