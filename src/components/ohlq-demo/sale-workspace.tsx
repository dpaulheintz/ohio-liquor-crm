'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Building2, Download, FilePenLine, History, Mail, MessageSquare, PenLine, Plus, Receipt, Send, Smartphone, Trash2, UserPlus, Users,
} from 'lucide-react';
import {
  createCustomer, deleteDraft, lastOrderFor, reopenSale, saveSale, sendForSignature, signA3a, startInPersonSigning, submitSale,
} from '@/app/demo/ohlq/actions';
import {
  DEMO_BASE, PARTNER, fmtCents, fmtDateTime, suggestSinTax, todayET,
  type AuditEntry, type Customer, type Product, type Sale, type Signature, type SinTaxConfig,
} from '@/lib/ohlq-demo/shared';
import { SignaturePad, SignatureView } from './signature-pad';
import { DemoDelivered, Dialog, Field, SaleStatusChip, Section } from './ui';

interface Line { key: string; code: string; quantity: string }
let keySeq = 0;
const newLine = (code = '', quantity = ''): Line => ({ key: `l${++keySeq}`, code, quantity });

export function SaleWorkspace({ sale, products, customers, counties, sinConfig, audit, initialDialog = null }: {
  sale: Sale | null; products: Product[]; customers: Customer[]; counties: string[]; sinConfig: SinTaxConfig; audit: AuditEntry[];
  /** Opens the A-3a or send dialog right after a first save (…?sign=a3a|send). */
  initialDialog?: 'a3a' | 'send' | null;
}) {
  const router = useRouter();
  const book = useMemo(() => new Map(products.map((p) => [p.code, p])), [products]);
  const editable = !sale || sale.status === 'draft' || sale.status === 'returned';

  const [customerId, setCustomerId] = useState<string | null>(sale?.customer_id ?? null);
  const [cust, setCust] = useState({
    name: sale?.customer_name ?? '', dba: sale?.customer_dba ?? '', phone: sale?.customer_phone ?? '', address: sale?.customer_address ?? '',
    city: sale?.customer_city ?? '', zip: sale?.customer_zip ?? '', county: sale?.customer_county ?? '', is_f2: sale?.is_f2 ?? false,
    permit_number: sale?.permit_number ?? '',
  });
  const [salesDate, setSalesDate] = useState(sale?.sales_date ?? todayET());
  const [lines, setLines] = useState<Line[]>(() => sale?.lines.length ? sale.lines.map((l) => newLine(l.brand_code, String(l.quantity))) : [newLine()]);
  const [sinDollars, setSinDollars] = useState(sale?.sin_tax_cents ? (sale.sin_tax_cents / 100).toFixed(2) : '');
  const [sinNote, setSinNote] = useState(sale?.sin_tax_note ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'a3a' | 'send' | 'customer'>(sale ? initialDialog : null);

  const priced = lines.map((l) => {
    const p = book.get(l.code);
    const qty = Math.max(0, Math.floor(Number(l.quantity) || 0));
    return { ...l, product: p, qty, subtotal: p ? p.priceCents * qty : 0 };
  });
  const subtotal = priced.reduce((s, l) => s + l.subtotal, 0);
  const sinCents = Math.max(0, Math.round((Number(sinDollars) || 0) * 100));
  const total = subtotal + sinCents;
  const sinSuggestion = suggestSinTax(cust.county, priced.filter((l) => l.product).map((l) => ({ volume_l: l.product!.volumeL, quantity: l.qty })), sinConfig);

  const viewLines = sale && !editable ? sale.lines : null;

  function payload() {
    return {
      id: sale?.id, customer_id: customerId,
      customer_name: cust.name, customer_dba: cust.dba, customer_phone: cust.phone, customer_address: cust.address,
      customer_city: cust.city, customer_zip: cust.zip, customer_county: cust.county, is_f2: cust.is_f2, permit_number: cust.permit_number,
      sales_date: salesDate,
      lines: priced.filter((l) => l.code || l.quantity).map((l) => ({ code: l.code, quantity: l.qty })),
      sin_tax_cents: sinCents, sin_tax_note: sinCents ? sinNote : '',
    };
  }

  // What was last saved, so signing/sending doesn't re-save (and re-audit) an unchanged draft.
  const lastSaved = useRef<string | null>(null);
  if (sale && lastSaved.current === null) lastSaved.current = JSON.stringify(payload());

  /** Save the form when it's editable and changed; returns the sale id. */
  async function ensureSaved(): Promise<string | null> {
    if (!editable && sale) return sale.id;
    const current = JSON.stringify(payload());
    if (sale && current === lastSaved.current) return sale.id;
    const bad = priced.find((l) => (l.code || l.quantity) && (!l.product || l.qty <= 0));
    if (bad) { setError(bad.product ? `Enter a quantity for ${bad.code}.` : `Pick a product for every row (brand code ${bad.code || 'blank'}).`); return null; }
    const r = await saveSale(payload());
    if (!r.ok) { setError(r.error); return null; }
    lastSaved.current = current;
    setError(null);
    return r.id;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  }

  function pickCustomer(c: Customer) {
    setCustomerId(c.id);
    setCust({ name: c.name, dba: c.dba ?? '', phone: c.phone ?? '', address: c.address ?? '', city: c.city ?? '', zip: c.zip ?? '', county: c.county ?? '', is_f2: c.is_f2, permit_number: c.permit_number });
  }

  function closeSignDialog() {
    setDialog(null);
    // drop ?sign=… so the dialog doesn't reopen when the page refreshes
    if (sale && typeof window !== 'undefined' && window.location.search) router.replace(`${DEMO_BASE}/wholesale/${sale.id}`);
  }

  const canSubmit = sale?.status === 'signed' && !!sale.a3a_signature && !!sale.customer_signature;
  const pdfHref = sale ? `${DEMO_BASE}/api/wholesale/${sale.id}/pdf` : '#';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="ohlq-title" style={{ marginBottom: 6 }}>{sale ? `Direct Sale ${sale.ref_no}` : 'New Direct Sale'}</h1>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {sale ? <SaleStatusChip status={sale.status} /> : <span className="ohlq-chip chip-draft">Draft (not saved)</span>}
        <span className="ohlq-help" style={{ margin: 0 }}>A-3a Direct Sale to Wholesale Customer</span>
      </div>
      <StatusSteps status={sale?.status ?? 'draft'} />

      {sale?.status === 'returned' && sale.return_note && (
        <div className="ohlq-warn" style={{ marginBottom: 16 }}><b className="ohlq-cond" style={{ fontWeight: 500 }}>Returned by OHLQ:</b> {sale.return_note} — correct the order and send it for signature again.</div>
      )}

      <Section icon={<Building2 aria-hidden />} title="A-3a Information">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="ohlq-input" readOnly value={PARTNER.name} /></Field>
          <Field label="Vendor #"><input className="ohlq-input" readOnly value={PARTNER.vendorNumber} /></Field>
          <Field label="Address"><input className="ohlq-input" readOnly value={PARTNER.address} /></Field>
          <div className="grid grid-cols-[1fr_70px_100px] gap-2">
            <Field label="City"><input className="ohlq-input" readOnly value={PARTNER.city} /></Field>
            <Field label="State"><input className="ohlq-input" readOnly value="OH" /></Field>
            <Field label="Postal"><input className="ohlq-input" readOnly value={PARTNER.zip} /></Field>
          </div>
          <Field label="Phone"><input className="ohlq-input" readOnly value={PARTNER.phone} /></Field>
          <Field label="Email"><input className="ohlq-input" readOnly value={PARTNER.email} /></Field>
        </div>
        <p className="ohlq-help">Filled from Partner Info — nothing to type.</p>
      </Section>

      <Section icon={<Users aria-hidden />} title="Wholesale Customer Information">
        {editable && (
          <div style={{ marginBottom: 16 }}>
            <CustomerSearch customers={customers} onPick={pickCustomer} />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="ohlq-linkbtn" onClick={() => setDialog('customer')}><UserPlus style={{ width: 15, height: 15, display: 'inline', verticalAlign: -2 }} /> New customer</button>
              {customerId && (
                <button type="button" className="ohlq-linkbtn" disabled={!!busy} onClick={() => run('repeat', async () => {
                  const r = await lastOrderFor(customerId);
                  if (!r.ok) { toast.error(r.error); return; }
                  setLines(r.lines.filter((l) => book.has(l.code)).map((l) => newLine(l.code, String(l.quantity))));
                  toast.success(`Copied ${r.lines.length} items from ${r.ref}`);
                })}><History style={{ width: 15, height: 15, display: 'inline', verticalAlign: -2 }} /> Repeat last order</button>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer Name" htmlFor="c-name"><input id="c-name" className="ohlq-input" readOnly={!editable} value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
          <Field label="Is this an F2 Permit?">
            <div style={{ display: 'flex', gap: 18, minHeight: 44, alignItems: 'center' }} className="ohlq-value">
              {[false, true].map((v) => (
                <label key={String(v)} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="radio" name="f2" checked={cust.is_f2 === v} disabled={!editable} onChange={() => setCust({ ...cust, is_f2: v })} /> {v ? 'Yes' : 'No'}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Customer DBA" htmlFor="c-dba"><input id="c-dba" className="ohlq-input" readOnly={!editable} value={cust.dba} onChange={(e) => setCust({ ...cust, dba: e.target.value })} /></Field>
          <Field label="Customer Phone" htmlFor="c-phone"><input id="c-phone" className="ohlq-input" type="tel" readOnly={!editable} value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></Field>
          <Field label="Customer Address" htmlFor="c-addr"><input id="c-addr" className="ohlq-input" readOnly={!editable} value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></Field>
          <Field label="Permit Number" htmlFor="c-permit"><input id="c-permit" className="ohlq-input" readOnly={!editable} value={cust.permit_number} onChange={(e) => { setCust({ ...cust, permit_number: e.target.value }); setCustomerId(null); }} /></Field>
          <div className="grid grid-cols-[1fr_70px_100px] gap-2">
            <Field label="City"><input className="ohlq-input" readOnly={!editable} value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} /></Field>
            <Field label="State"><input className="ohlq-input" readOnly value="OH" /></Field>
            <Field label="Postal"><input className="ohlq-input" inputMode="numeric" readOnly={!editable} value={cust.zip} onChange={(e) => setCust({ ...cust, zip: e.target.value })} /></Field>
          </div>
          <Field label="County" help="Used to suggest local SIN tax.">
            <input className="ohlq-input" list="ohlq-counties" readOnly={!editable} value={cust.county} onChange={(e) => setCust({ ...cust, county: e.target.value })} />
            <datalist id="ohlq-counties">{counties.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
      </Section>

      <Section icon={<Receipt aria-hidden />} title="Sale">
        <div style={{ maxWidth: 260, marginBottom: 16 }}>
          <Field label="Sales Date" htmlFor="s-date"><input id="s-date" className="ohlq-input" type="date" readOnly={!editable} value={salesDate} onChange={(e) => setSalesDate(e.target.value)} /></Field>
        </div>

        {viewLines ? (
          <div className="ohlq-table-wrap">
            <table className="ohlq-table">
              <thead><tr><th>Brand Code</th><th>Product Name</th><th className="num">Quantity (Bottles)</th><th className="num">Price Per Bottle</th><th className="num">Item Subtotal</th></tr></thead>
              <tbody>{viewLines.map((l) => (
                <tr key={l.id}><td><b>{l.brand_code}</b></td><td>{l.description} {l.size_label}</td><td className="num">{l.quantity}</td><td className="num">{fmtCents(l.price_cents)}</td><td className="num">{fmtCents(l.line_total_cents)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="ohlq-label desktop-grid" style={{ gridTemplateColumns: '150px 1fr 110px 120px 120px 40px', gap: 10, marginBottom: 0 }}>
              <span>Brand Code</span><span>Product Name</span><span style={{ textAlign: 'right' }}>Qty (Bottles)</span><span style={{ textAlign: 'right' }}>Price / Bottle</span><span style={{ textAlign: 'right' }}>Item Subtotal</span><span />
            </div>
            {priced.map((l, i) => (
              <div key={l.key} data-line-row className="grid gap-2 md:items-center grid-cols-2 md:grid-cols-[150px_1fr_110px_120px_120px_40px]"
                style={{ borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                <div className="col-span-2 md:col-span-1">
                  <BrandCodePicker products={products} value={l.code} onPick={(code) => setLines(lines.map((x) => x.key === l.key ? { ...x, code } : x))} autoFocus={i === lines.length - 1 && i > 0} />
                </div>
                <div className="col-span-2 md:col-span-1 ohlq-value" style={{ minHeight: 24 }} data-product-name>
                  {l.product ? <>{l.product.name} <span className="ohlq-muted">{l.product.size}</span></> : <span className="ohlq-muted">Pick a brand code</span>}
                </div>
                <div>
                  <span className="ohlq-label mobile-only">Qty (bottles)</span>
                  <input className="ohlq-input" inputMode="numeric" aria-label={`Quantity for row ${i + 1}`} style={{ textAlign: 'right' }} value={l.quantity}
                    onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, quantity: e.target.value.replace(/[^\d]/g, '').slice(0, 4) } : x))} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="ohlq-label mobile-only">Price / bottle</span>
                  <span className="ohlq-value" data-price title="From the OHLQ price list — can’t be edited">{l.product ? fmtCents(l.product.priceCents) : '—'}</span>
                </div>
                <div style={{ textAlign: 'right' }} className="ohlq-value">
                  <span className="ohlq-label mobile-only">Subtotal</span>
                  <b>{fmtCents(l.subtotal)}</b>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button type="button" className="ohlq-linkbtn" aria-label={`Remove row ${i + 1}`} onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [newLine()])}>
                    <Trash2 style={{ width: 18, height: 18 }} />
                  </button>
                </div>
              </div>
            ))}
            <div><button type="button" className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" onClick={() => setLines([...lines, newLine()])}><Plus aria-hidden /> Add product</button></div>
            <p className="ohlq-help" style={{ marginTop: 0 }}>Product names and prices come from your OHLQ price list and can&rsquo;t be edited — no wrong prices.</p>
          </div>
        )}

        <div style={{ marginTop: 18, marginLeft: 'auto', maxWidth: 420, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="ohlq-value"><span>Subtotal</span><span>{fmtCents(viewLines ? sale!.subtotal_cents : subtotal)}</span></div>
          <div>
            <Field label="SIN tax, if applicable">
              {editable ? (
                <input className="ohlq-input" inputMode="decimal" placeholder="0.00" value={sinDollars} style={{ textAlign: 'right' }}
                  onChange={(e) => setSinDollars(e.target.value.replace(/[^\d.]/g, ''))} />
              ) : <div className="ohlq-value" style={{ textAlign: 'right' }}>{sale!.sin_tax_cents ? fmtCents(sale!.sin_tax_cents) : '—'}</div>}
            </Field>
            {editable && sinSuggestion && sinSuggestion.cents !== sinCents && (
              <div className="ohlq-warn" data-sin-suggestion>
                {sinSuggestion.county} SIN tax suggested: <b>{fmtCents(sinSuggestion.cents)}</b> ({fmtCents(sinSuggestion.centsPerGallon)}/gallon). <i>{sinSuggestion.note}.</i>{' '}
                <button type="button" className="ohlq-linkbtn" onClick={() => { setSinDollars((sinSuggestion.cents / 100).toFixed(2)); setSinNote(`${sinSuggestion.county} SIN tax — ${sinSuggestion.note}`); }}>Apply</button>
              </div>
            )}
            {!editable && sale?.sin_tax_note && <p className="ohlq-help">{sale.sin_tax_note}</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #333', paddingTop: 10 }}>
            <span className="ohlq-cond" style={{ fontSize: 22, fontWeight: 600 }}>Invoice Total</span>
            <span className="ohlq-value" style={{ fontSize: 22, fontWeight: 700 }} data-invoice-total>{fmtCents(viewLines ? sale!.total_cents : total)}</span>
          </div>
        </div>
      </Section>

      <Section icon={<PenLine aria-hidden />} title="Signatures">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <span className="ohlq-label">A-3a Signature</span>
            {sale?.a3a_signature ? (
              <SignedBlock sig={sale.a3a_signature} name={`${sale.a3a_signer_name ?? ''}${sale.a3a_signer_title ? `, ${sale.a3a_signer_title}` : ''}`} at={sale.a3a_signed_at} device={sale.a3a_device} />
            ) : <p className="ohlq-value ohlq-muted">Not signed yet.</p>}
            {(!sale || !['submitted', 'processed'].includes(sale.status)) && (
              <button type="button" className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" style={{ marginTop: 8 }} disabled={!!busy}
                onClick={() => run('a3a', async () => {
                  const id = await ensureSaved();
                  if (!id) return;
                  if (!sale) { router.replace(`${DEMO_BASE}/wholesale/${id}?sign=a3a`); return; }
                  setDialog('a3a');
                })}>
                <PenLine aria-hidden /> {sale?.a3a_signature ? 'Re-sign' : 'Sign as A-3a'}
              </button>
            )}
          </div>
          <div>
            <span className="ohlq-label">Customer Signature</span>
            {sale?.customer_signature ? (
              <SignedBlock sig={sale.customer_signature} name={sale.customer_signer_name ?? ''} at={sale.customer_signed_at} device={`${sale.customer_device ?? ''} · agreed to sign electronically`} />
            ) : sale?.status === 'awaiting_customer' ? (
              <p className="ohlq-value">
                Waiting for the customer{sale.sign_sent_to ? <> — sent by {sale.sign_method === 'sms' ? 'text' : 'email'} to <b>{sale.sign_sent_to}</b> {fmtDateTime(sale.sign_sent_at)} <DemoDelivered /></> : ' (in-person signing opened)'}.
              </p>
            ) : <p className="ohlq-value ohlq-muted">Not signed yet.</p>}
            {(!sale || ['draft', 'returned', 'awaiting_customer'].includes(sale.status)) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" disabled={!!busy}
                  onClick={() => run('send', async () => {
                    const id = await ensureSaved();
                    if (!id) return;
                    if (!sale) { router.replace(`${DEMO_BASE}/wholesale/${id}?sign=send`); return; }
                    setDialog('send');
                  })}><Send aria-hidden /> {sale?.status === 'awaiting_customer' ? 'Resend' : 'Send for signature'}</button>
                <button type="button" className="ohlq-btn ohlq-btn-outline ohlq-btn-sm" disabled={!!busy}
                  onClick={() => run('inperson', async () => {
                    const id = await ensureSaved();
                    if (!id) return;
                    const r = await startInPersonSigning(id);
                    if (!r.ok) { setError(r.error); return; }
                    router.push(`${DEMO_BASE}/sign/${r.token}?inperson=1`);
                  })}><Smartphone aria-hidden /> Sign in person</button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {error && <p className="ohlq-error" role="alert" style={{ fontSize: 16, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {editable && (
          <button type="button" className="ohlq-btn ohlq-btn-dark" disabled={!!busy} onClick={() => run('save', async () => {
            const id = await ensureSaved();
            if (!id) return;
            toast.success('Draft saved');
            if (!sale) router.replace(`${DEMO_BASE}/wholesale/${id}`); else router.refresh();
          })}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        )}
        {sale && !['submitted', 'processed'].includes(sale.status) && (
          <button type="button" className="ohlq-btn" disabled={!canSubmit || !!busy} title={canSubmit ? undefined : 'Both signatures are needed first'}
            onClick={() => run('submit', async () => {
              const r = await submitSale(sale.id);
              if (!r.ok) { setError(r.error); return; }
              toast.success(`${sale.ref_no} submitted to OHLQ`);
              router.refresh();
            })}><Send aria-hidden /> {busy === 'submit' ? 'Submitting…' : 'Submit to OHLQ'}</button>
        )}
        {sale && <a className="ohlq-btn ohlq-btn-outline" href={pdfHref} target="_blank" rel="noreferrer"><Download aria-hidden /> PDF</a>}
        {sale && ['awaiting_customer', 'signed'].includes(sale.status) && (
          <button type="button" className="ohlq-btn ohlq-btn-outline" disabled={!!busy} onClick={() => run('reopen', async () => {
            const r = await reopenSale(sale.id);
            if (!r.ok) { setError(r.error); return; }
            router.refresh();
          })}><FilePenLine aria-hidden /> Edit order</button>
        )}
        {sale?.status === 'draft' && (
          <button type="button" className="ohlq-linkbtn" disabled={!!busy} onClick={() => run('delete', async () => {
            if (!window.confirm(`Delete draft ${sale.ref_no}?`)) return;
            const r = await deleteDraft(sale.id);
            if (r.ok) router.replace(`${DEMO_BASE}/wholesale`);
          })}>Delete draft</button>
        )}
        {sale && !canSubmit && !['submitted', 'processed'].includes(sale.status) && (
          <span className="ohlq-help" style={{ margin: 0 }}>Submitting unlocks once both the A-3a and the customer have signed.</span>
        )}
        {sale?.status === 'submitted' && <span className="ohlq-help" style={{ margin: 0 }}>Submitted {fmtDateTime(sale.submitted_at)} — OHLQ Agency Operations will process it.</span>}
      </div>

      {sale && audit.length > 0 && (
        <Section icon={<History aria-hidden />} title="History" defaultOpen={false}>
          <AuditList audit={audit} />
        </Section>
      )}

      {dialog === 'a3a' && sale && <A3aSignDialog saleId={sale.id} onClose={closeSignDialog} onDone={() => { closeSignDialog(); router.refresh(); }} />}
      {dialog === 'send' && sale && <SendDialog saleId={sale.id} defaultEmail="" onClose={closeSignDialog} onDone={() => { closeSignDialog(); router.refresh(); }} />}
      {dialog === 'customer' && (
        <NewCustomerDialog counties={counties} initial={cust} onClose={() => setDialog(null)} onSaved={(c) => { setDialog(null); pickCustomer(c); router.refresh(); }} />
      )}
    </>
  );
}

function StatusSteps({ status }: { status: Sale['status'] }) {
  const steps: { key: Sale['status'][]; label: string }[] = [
    { key: ['draft', 'returned'], label: 'Draft' },
    { key: ['awaiting_customer'], label: 'Awaiting customer' },
    { key: ['signed'], label: 'Signed' },
    { key: ['submitted'], label: 'Submitted to OHLQ' },
    { key: ['processed'], label: 'Processed' },
  ];
  const idx = steps.findIndex((s) => s.key.includes(status));
  return (
    <ol aria-label="Progress" style={{ display: 'flex', gap: 4, listStyle: 'none', padding: 0, margin: '0 0 18px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {steps.map((s, i) => (
        <li key={s.label} className="ohlq-cond" style={{
          fontSize: 13, padding: '5px 10px', borderRadius: 3,
          background: i < idx ? '#e6f4ea' : i === idx ? 'var(--ohlq-red)' : '#e9e9e9', color: i < idx ? '#1e6b34' : i === idx ? '#fff' : '#777',
        }}>{i < idx ? '✓ ' : ''}{s.label}</li>
      ))}
    </ol>
  );
}

function SignedBlock({ sig, name, at, device }: { sig: Signature; name: string; at: string | null; device: string | null }) {
  return (
    <div style={{ border: '1px solid #e3e3e3', padding: 10, background: '#fffefb', maxWidth: 360 }}>
      <SignatureView sig={sig} width={260} />
      <div className="ohlq-value" style={{ fontSize: 15, borderTop: '1px solid #ccc', marginTop: 4, paddingTop: 4 }}>{name}</div>
      <div className="ohlq-help" style={{ marginTop: 0 }}>Signed electronically {fmtDateTime(at)}{device ? ` · ${device}` : ''}</div>
    </div>
  );
}

export function AuditList({ audit }: { audit: AuditEntry[] }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {audit.map((a) => (
        <li key={a.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10 }} className="ohlq-value">
          <span className="ohlq-help" style={{ marginTop: 2 }}>{fmtDateTime(a.created_at)}</span>
          <span><b>{a.action}</b> — {a.actor}{a.detail ? <span className="ohlq-muted"> · {a.detail}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}

function CustomerSearch({ customers, onPick }: { customers: Customer[]; onPick: (c: Customer) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const hits = term ? customers.filter((c) => [c.permit_number, c.name, c.dba ?? '', c.city ?? ''].some((v) => v.toLowerCase().includes(term))).slice(0, 8) : customers.slice(0, 8);
  return (
    <div style={{ position: 'relative' }}>
      <label className="ohlq-label" htmlFor="cust-search">Find customer by permit number or name</label>
      <input id="cust-search" className="ohlq-input" placeholder="e.g. 00257887-1 or Clock Tower" value={q} autoComplete="off"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); onPick(hits[0]); setQ(''); setOpen(false); } }} />
      {open && hits.length > 0 && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, background: '#fff', border: '1px solid #ccc', margin: 0, padding: 0, listStyle: 'none', maxHeight: 300, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {hits.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setQ(''); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 0, borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                <span className="ohlq-value" style={{ fontSize: 16 }}><b>{c.dba || c.name}</b>{c.dba ? <span className="ohlq-muted"> · {c.name}</span> : null}</span>
                <span className="ohlq-help" style={{ display: 'block', marginTop: 0 }}>Permit {c.permit_number} · {c.city}{c.permit_verified ? '' : ' · new (unverified)'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BrandCodePicker({ products, value, onPick, autoFocus }: { products: Product[]; value: string; onPick: (code: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const term = q.trim().toLowerCase();
  const hits = (term && term !== value.toLowerCase()
    ? products.filter((p) => p.code.toLowerCase().startsWith(term) || p.name.toLowerCase().includes(term))
    : products).slice(0, 10);
  const commit = (p: Product) => { onPick(p.code); setQ(p.code); setOpen(false); };
  return (
    <div style={{ position: 'relative' }}>
      <span className="ohlq-label mobile-only">Brand code</span>
      <input className="ohlq-input" aria-label="Brand code" placeholder="Code or name" value={q} autoComplete="off" autoFocus={autoFocus} data-brand-code
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => { setOpen(false); setQ(value); }, 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) commit(hits[0]); } }} />
      {open && (
        <ul role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, width: 'min(420px, 88vw)', background: '#fff', border: '1px solid #ccc', margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
          {hits.length === 0 && <li className="ohlq-help" style={{ padding: 10 }}>No product in your price list matches.</li>}
          {hits.map((p) => (
            <li key={p.code} role="option" aria-selected={p.code === value}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(p)}
                style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: p.code === value ? '#fbeeee' : 'none', border: 0, borderBottom: '1px solid #f0f0f0', cursor: 'pointer', font: '15px var(--ohlq-serif)' }}>
                <b style={{ minWidth: 52 }}>{p.code}</b><span style={{ flex: 1 }}>{p.name} <span className="ohlq-muted">{p.size}</span></span><span>{fmtCents(p.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function A3aSignDialog({ saleId, onClose, onDone }: { saleId: string; onClose: () => void; onDone: () => void }) {
  const [sig, setSig] = useState<Signature | null>(null);
  const [name, setName] = useState('Paul Heintzman');
  const [title, setTitle] = useState('A-3a Permit Holder');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="A-3a signature" onClose={onClose}>
      <SignaturePad onChange={setSig} />
      <div className="grid gap-3 sm:grid-cols-2" style={{ marginTop: 12 }}>
        <Field label="Typed name"><input className="ohlq-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Title"><input className="ohlq-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      </div>
      {err && <p className="ohlq-error">{err}</p>}
      <button type="button" className="ohlq-btn" style={{ marginTop: 14, width: '100%' }} disabled={!sig || busy} onClick={async () => {
        setBusy(true);
        const r = await signA3a(saleId, { signature: sig!, name, title });
        setBusy(false);
        if (!r.ok) { setErr(r.error); return; }
        toast.success('A-3a signature saved');
        onDone();
      }}>{busy ? 'Saving…' : 'Apply signature'}</button>
    </Dialog>
  );
}

function SendDialog({ saleId, defaultEmail, onClose, onDone }: { saleId: string; defaultEmail: string; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [to, setTo] = useState(defaultEmail);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Send for customer signature" onClose={onClose}>
      <div className="ohlq-switch-group" role="radiogroup" aria-label="Send by" style={{ marginBottom: 12 }}>
        <a href="#" role="radio" aria-checked={method === 'email'} className={method === 'email' ? 'on' : undefined} onClick={(e) => { e.preventDefault(); setMethod('email'); setTo(''); }}><Mail style={{ width: 14, height: 14, display: 'inline', verticalAlign: -2 }} /> Email</a>
        <a href="#" role="radio" aria-checked={method === 'sms'} className={method === 'sms' ? 'on' : undefined} onClick={(e) => { e.preventDefault(); setMethod('sms'); setTo(''); }}><MessageSquare style={{ width: 14, height: 14, display: 'inline', verticalAlign: -2 }} /> Text</a>
      </div>
      <Field label={method === 'email' ? 'Customer email' : 'Customer mobile number'}>
        <input className="ohlq-input" type={method === 'email' ? 'email' : 'tel'} value={to} onChange={(e) => setTo(e.target.value)} placeholder={method === 'email' ? 'manager@restaurant.com' : '614-555-0100'} autoFocus />
      </Field>
      {method === 'sms' && <p className="ohlq-warn">Texting needs an SMS provider; email used in demo.</p>}
      <p className="ohlq-help">The customer gets a secure link to review the order and sign on their phone — no account needed. <DemoDelivered /></p>
      {err && <p className="ohlq-error">{err}</p>}
      <button type="button" className="ohlq-btn" style={{ marginTop: 12, width: '100%' }} disabled={busy || !to.trim()} onClick={async () => {
        setBusy(true);
        const r = await sendForSignature(saleId, { method, to });
        setBusy(false);
        if (!r.ok) { setErr(r.error); return; }
        toast.success(r.status === 'sent' ? `Sent — (Demo: delivered to Paul)` : `Link created — email isn’t configured on this server (${r.status.replace('_', ' ')})`);
        onDone();
      }}><Send aria-hidden /> {busy ? 'Sending…' : 'Send link'}</button>
    </Dialog>
  );
}

function NewCustomerDialog({ counties, initial, onClose, onSaved }: {
  counties: string[]; initial: { name: string; dba: string; phone: string; address: string; city: string; zip: string; county: string; is_f2: boolean; permit_number: string };
  onClose: () => void; onSaved: (c: Customer) => void;
}) {
  const [c, setC] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  return (
    <Dialog title="New wholesale customer" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer Name"><input className="ohlq-input" value={c.name} onChange={set('name')} /></Field>
        <Field label="Customer DBA"><input className="ohlq-input" value={c.dba} onChange={set('dba')} /></Field>
        <Field label="Permit Number"><input className="ohlq-input" value={c.permit_number} onChange={set('permit_number')} /></Field>
        <Field label="Phone"><input className="ohlq-input" type="tel" value={c.phone} onChange={set('phone')} /></Field>
        <Field label="Address"><input className="ohlq-input" value={c.address} onChange={set('address')} /></Field>
        <Field label="City"><input className="ohlq-input" value={c.city} onChange={set('city')} /></Field>
        <Field label="Postal"><input className="ohlq-input" value={c.zip} onChange={set('zip')} /></Field>
        <Field label="County"><input className="ohlq-input" list="ohlq-counties-new" value={c.county} onChange={set('county')} /><datalist id="ohlq-counties-new">{counties.map((x) => <option key={x} value={x} />)}</datalist></Field>
      </div>
      <label className="ohlq-value" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
        <input type="checkbox" checked={c.is_f2} onChange={(e) => setC({ ...c, is_f2: e.target.checked })} /> This is an F2 permit
      </label>
      {err && <p className="ohlq-error">{err}</p>}
      <button type="button" className="ohlq-btn" style={{ marginTop: 12, width: '100%' }} disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await createCustomer(c);
        setBusy(false);
        if (!r.ok) { setErr(r.error); return; }
        toast.success('Customer saved for next time');
        onSaved({ id: r.id, ...c, dba: c.dba || null, phone: c.phone || null, address: c.address || null, city: c.city || null, zip: c.zip || null, county: c.county || null, state: 'OH', permit_verified: false });
      }}>{busy ? 'Saving…' : 'Save customer'}</button>
      <p className="ohlq-help">New permits are checked by OHLQ when the sale is submitted.</p>
    </Dialog>
  );
}
