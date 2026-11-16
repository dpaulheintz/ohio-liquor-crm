'use server';

// OHLQ Ops concept demo — server actions. Every action (except entering the access code) checks the
// demo access cookie; all writes use the service role. Prices are always re-read from the price book
// here, never trusted from the browser.
import { randomBytes } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { accessTokenFor } from '@/lib/ohlq-demo/access-token';
import {
  addAudit, assertDemoAccess, db, escapeHtml, getAgencies, getProducts, getSale, getSinTaxConfig, getTasting, getTastings,
  nextRef, requestOrigin, sendDemoMessage, setSetting,
} from '@/lib/ohlq-demo/server';
import { resetDemo } from '@/lib/ohlq-demo/seed';
import { renderA3aPdf, renderTastingPdf } from '@/lib/ohlq-demo/pdf';
import {
  ACCESS_COOKIE, ACCESS_COOKIE_DAYS, DEMO_BASE, OPS_ACTOR, PARTNER, SUPPLIER_ACTOR, TASTING_MAX_MINUTES,
  describeDevice, earliestTastingDate, fmtCents, fmtDate, fmtShortDay, fmtTime, isSignature, minutesOf, todayET,
  type ApplicantType, type Signature,
} from '@/lib/ohlq-demo/shared';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const nullable = (v: unknown, max = 200) => clean(v, max) || null;

function revalidateAll() {
  revalidatePath(DEMO_BASE, 'layout');
}

async function device(): Promise<string> {
  return describeDevice((await headers()).get('user-agent'));
}

// ─── Access ───────────────────────────────────────────────────────────────────

export async function enterAccessCode(_prev: { error: string }, form: FormData): Promise<{ error: string }> {
  const expected = process.env.OHLQ_DEMO_CODE;
  const code = clean(form.get('code'), 100);
  if (!expected) return { error: 'The demo access code isn’t set up on this server.' };
  if (code !== expected.trim()) return { error: 'That code didn’t work. Check it and try again.' };
  (await cookies()).set(ACCESS_COOKIE, await accessTokenFor(expected), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: DEMO_BASE, maxAge: ACCESS_COOKIE_DAYS * 86400,
  });
  const next = clean(form.get('next'), 300);
  redirect(next.startsWith(`${DEMO_BASE}/`) && !next.startsWith('//') ? next : `${DEMO_BASE}/wholesale`);
}

export async function resetDemoAction(): Promise<Result<{ summary: string }>> {
  await assertDemoAccess();
  const r = await resetDemo();
  revalidateAll();
  return { ok: true, summary: `Restored ${r.sales} wholesale sales, ${r.tastings} tasting applications and ${r.customers} customers.` };
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface CustomerInput {
  name: string; dba?: string; phone?: string; address?: string; city?: string; zip?: string; county?: string;
  is_f2: boolean; permit_number: string;
}

export async function createCustomer(input: CustomerInput): Promise<Result<{ id: string }>> {
  await assertDemoAccess();
  const name = clean(input.name), permit = clean(input.permit_number, 40);
  if (!name) return fail('Customer name is required.');
  if (!permit) return fail('Permit number is required.');
  const { data: existing } = await db().from('ohlq_demo_customers').select('id').eq('permit_number', permit).maybeSingle();
  if (existing) return fail(`Permit ${permit} is already saved.`);
  const { data, error } = await db().from('ohlq_demo_customers').insert({
    name, dba: nullable(input.dba), phone: nullable(input.phone, 40), address: nullable(input.address),
    city: nullable(input.city, 80), state: 'OH', zip: nullable(input.zip, 10), county: nullable(input.county, 60),
    is_f2: !!input.is_f2, permit_number: permit, permit_verified: false,
  }).select('id').single();
  if (error) return fail(error.message);
  revalidateAll();
  return { ok: true, id: data.id };
}

/** Lines from this customer's most recent sale (for "Repeat last order"). */
export async function lastOrderFor(customerId: string): Promise<Result<{ ref: string; lines: { code: string; quantity: number }[] }>> {
  await assertDemoAccess();
  const { data } = await db().from('ohlq_demo_wholesale_sales')
    .select('ref_no, lines:ohlq_demo_wholesale_lines(brand_code, quantity, sort_order)')
    .eq('customer_id', customerId).order('sales_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return fail('No previous order for this customer.');
  const lines = ((data.lines ?? []) as { brand_code: string; quantity: number; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order).map((l) => ({ code: l.brand_code, quantity: l.quantity }));
  return { ok: true, ref: data.ref_no, lines };
}

// ─── Direct wholesale sales (supplier) ────────────────────────────────────────

export interface SaleInput {
  id?: string;
  customer_id: string | null;
  customer_name: string; customer_dba?: string; customer_phone?: string; customer_address?: string;
  customer_city?: string; customer_zip?: string; customer_county?: string;
  is_f2: boolean; permit_number: string;
  sales_date: string;
  lines: { code: string; quantity: number }[];
  sin_tax_cents: number;
  sin_tax_note?: string;
}

export async function saveSale(input: SaleInput): Promise<Result<{ id: string }>> {
  await assertDemoAccess();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sales_date)) return fail('Sales date is required.');
  if (!clean(input.customer_name)) return fail('Choose or enter the wholesale customer.');
  if (!clean(input.permit_number)) return fail('Permit number is required.');
  const book = new Map((await getProducts()).map((p) => [p.code, p]));
  const lines = [];
  for (const [i, l] of input.lines.entries()) {
    const p = book.get(l.code);
    const qty = Math.floor(Number(l.quantity));
    if (!p) return fail(`Brand code ${l.code} isn’t in your price list.`);
    if (!(qty > 0 && qty <= 9999)) return fail(`Enter a quantity in bottles for ${l.code}.`);
    lines.push({ brand_code: p.code, description: p.name, size_label: p.size, volume_l: p.volumeL, price_cents: p.priceCents, quantity: qty, line_total_cents: p.priceCents * qty, sort_order: i });
  }
  if (lines.length === 0) return fail('Add at least one product.');
  const sin = Math.max(0, Math.round(Number(input.sin_tax_cents) || 0));
  const subtotal = lines.reduce((s, l) => s + l.line_total_cents, 0);

  const row = {
    customer_id: input.customer_id || null,
    customer_name: clean(input.customer_name), customer_dba: nullable(input.customer_dba), customer_phone: nullable(input.customer_phone, 40),
    customer_address: nullable(input.customer_address), customer_city: nullable(input.customer_city, 80), customer_state: 'OH',
    customer_zip: nullable(input.customer_zip, 10), customer_county: nullable(input.customer_county, 60),
    is_f2: !!input.is_f2, permit_number: clean(input.permit_number, 40), sales_date: input.sales_date,
    subtotal_cents: subtotal, sin_tax_cents: sin, sin_tax_note: sin ? nullable(input.sin_tax_note, 200) : null, total_cents: subtotal + sin,
    updated_at: new Date().toISOString(),
  };

  const supa = db();
  let id = input.id;
  if (id) {
    const existing = await getSale(id);
    if (!existing) return fail('Sale not found.');
    if (!['draft', 'returned'].includes(existing.status)) return fail('This sale is locked for signature. Use “Edit order” to change it.');
    const { error } = await supa.from('ohlq_demo_wholesale_sales').update({ ...row, status: 'draft' }).eq('id', id);
    if (error) return fail(error.message);
    await supa.from('ohlq_demo_wholesale_lines').delete().eq('sale_id', id);
    await addAudit('wholesale', id, SUPPLIER_ACTOR, existing.status === 'returned' ? 'Corrected after return' : 'Saved draft', `${lines.length} line items · ${fmtCents(subtotal + sin)}`);
  } else {
    const { data, error } = await supa.from('ohlq_demo_wholesale_sales').insert({ ...row, ref_no: await nextRef('WS'), supplier_name: PARTNER.name, status: 'draft' }).select('id').single();
    if (error) return fail(error.message);
    id = data.id as string;
    await addAudit('wholesale', id, SUPPLIER_ACTOR, 'Created draft', `${lines.length} line items · ${fmtCents(subtotal + sin)}`);
  }
  const { error: lErr } = await supa.from('ohlq_demo_wholesale_lines').insert(lines.map((l) => ({ ...l, sale_id: id })));
  if (lErr) return fail(lErr.message);
  revalidateAll();
  return { ok: true, id: id! };
}

export async function signA3a(id: string, input: { signature: Signature; name: string; title: string }): Promise<Result> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  if (['submitted', 'processed'].includes(sale.status)) return fail('This sale was already submitted.');
  if (!isSignature(input.signature)) return fail('Draw your signature first.');
  if (!clean(input.name)) return fail('Type your name.');
  const dev = await device();
  await db().from('ohlq_demo_wholesale_sales').update({
    a3a_signature: input.signature, a3a_signer_name: clean(input.name), a3a_signer_title: nullable(input.title, 80),
    a3a_signed_at: new Date().toISOString(), a3a_device: dev, updated_at: new Date().toISOString(),
  }).eq('id', id);
  await addAudit('wholesale', id, SUPPLIER_ACTOR, 'A-3a signed', `${clean(input.name)} · ${dev}`);
  revalidateAll();
  return { ok: true };
}

async function ensureToken(id: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const token = randomBytes(24).toString('base64url');
  await db().from('ohlq_demo_wholesale_sales').update({ sign_token: token }).eq('id', id);
  return token;
}

export async function sendForSignature(id: string, input: { method: 'email' | 'sms'; to: string }): Promise<Result<{ delivered: string; status: string }>> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  if (!['draft', 'returned', 'awaiting_customer'].includes(sale.status)) return fail('This sale can’t be sent for signature now.');
  if (sale.lines.length === 0) return fail('Add products before sending.');
  const to = clean(input.to, 120);
  if (!to) return fail(input.method === 'sms' ? 'Enter the customer’s mobile number.' : 'Enter the customer’s email.');
  const token = await ensureToken(id, sale.sign_token);
  const link = `${await requestOrigin()}${DEMO_BASE}/sign/${token}`;
  await db().from('ohlq_demo_wholesale_sales').update({
    status: 'awaiting_customer', sign_method: input.method, sign_sent_to: to, sign_sent_at: new Date().toISOString(),
    customer_signature: null, customer_signer_name: null, customer_signed_at: null, customer_device: null, customer_consent: false,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  const rows = sale.lines.map((l) => `<tr><td style="padding:4px 8px">${escapeHtml(l.brand_code)}</td><td style="padding:4px 8px">${escapeHtml(l.description)} ${escapeHtml(l.size_label ?? '')}</td><td style="padding:4px 8px;text-align:right">${l.quantity}</td><td style="padding:4px 8px;text-align:right">${fmtCents(l.line_total_cents)}</td></tr>`).join('');
  const msg = await sendDemoMessage({
    requestedTo: to, channel: input.method,
    subject: `Please sign: ${PARTNER.name} direct sale ${sale.ref_no} (${fmtCents(sale.total_cents)})`,
    html: `<div style="font:15px Georgia,serif;color:#222">
      <p>${escapeHtml(PARTNER.name)} recorded a direct sale to <b>${escapeHtml(sale.customer_dba || sale.customer_name || '')}</b> on ${fmtDate(sale.sales_date)}. Please review and sign.</p>
      <table style="border-collapse:collapse;font:14px Georgia,serif">${rows}<tr><td colspan="3" style="padding:6px 8px;text-align:right"><b>Invoice total</b></td><td style="padding:6px 8px;text-align:right"><b>${fmtCents(sale.total_cents)}</b></td></tr></table>
      <p style="margin:18px 0"><a href="${link}" style="background:#B72B35;color:#fff;padding:12px 18px;text-decoration:none;font:600 15px Arial,sans-serif;text-transform:uppercase">Review &amp; sign</a></p>
      <p style="font-size:12px;color:#666">${link}</p></div>`,
    text: `Please review and sign ${sale.ref_no}: ${link}`,
  });
  await addAudit('wholesale', id, SUPPLIER_ACTOR, 'Sent for customer signature',
    `${input.method === 'sms' ? 'Text' : 'Email'} to ${to} → delivered to Paul (demo)${msg.status === 'sent' ? '' : ` · ${msg.status.replace('_', ' ')}`}`);
  revalidateAll();
  return { ok: true, delivered: msg.deliveredTo, status: msg.status };
}

export async function startInPersonSigning(id: string): Promise<Result<{ token: string }>> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  if (!['draft', 'returned', 'awaiting_customer'].includes(sale.status)) return fail('This sale can’t be signed now.');
  if (sale.lines.length === 0) return fail('Add products first.');
  const token = await ensureToken(id, sale.sign_token);
  await db().from('ohlq_demo_wholesale_sales').update({ status: 'awaiting_customer', sign_method: 'in_person', updated_at: new Date().toISOString() }).eq('id', id);
  await addAudit('wholesale', id, SUPPLIER_ACTOR, 'Opened in-person signing', await device());
  revalidateAll();
  return { ok: true, token };
}

/** Unlock a sale for editing (clears the customer's signature — they must sign the new version). */
export async function reopenSale(id: string): Promise<Result> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  if (!['awaiting_customer', 'signed', 'returned'].includes(sale.status)) return fail('This sale can’t be edited now.');
  await db().from('ohlq_demo_wholesale_sales').update({
    status: 'draft', customer_signature: null, customer_signer_name: null, customer_signed_at: null, customer_device: null,
    customer_consent: false, sign_token: null, updated_at: new Date().toISOString(),
  }).eq('id', id);
  await addAudit('wholesale', id, SUPPLIER_ACTOR, 'Reopened for editing', sale.customer_signature ? 'Customer signature cleared' : undefined);
  revalidateAll();
  return { ok: true };
}

export async function submitSale(id: string): Promise<Result> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  if (sale.status !== 'signed') return fail('Both signatures are needed before submitting.');
  if (!sale.a3a_signature) return fail('The A-3a signature is missing.');
  if (!sale.customer_signature) return fail('The customer signature is missing.');
  await db().from('ohlq_demo_wholesale_sales').update({ status: 'submitted', submitted_at: new Date().toISOString(), return_note: null, updated_at: new Date().toISOString() }).eq('id', id);
  await addAudit('wholesale', id, SUPPLIER_ACTOR, 'Submitted to OHLQ');
  revalidateAll();
  return { ok: true };
}

export async function deleteDraft(id: string): Promise<Result> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale || sale.status !== 'draft') return fail('Only drafts can be deleted.');
  await db().from('ohlq_demo_wholesale_sales').delete().eq('id', id);
  revalidateAll();
  return { ok: true };
}

// ─── Direct wholesale sales (OHLQ Ops) ────────────────────────────────────────

export async function processSale(id: string): Promise<Result> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale || sale.status !== 'submitted') return fail('Only submitted sales can be processed.');
  await db().from('ohlq_demo_wholesale_sales').update({ status: 'processed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  await addAudit('wholesale', id, OPS_ACTOR, 'Processed', 'Ready for export — no retyping');
  revalidateAll();
  return { ok: true };
}

export async function returnSale(id: string, note: string): Promise<Result<{ delivered: string }>> {
  await assertDemoAccess();
  const reason = clean(note, 1000);
  if (!reason) return fail('Add a note for the supplier.');
  const sale = await getSale(id);
  if (!sale || sale.status !== 'submitted') return fail('Only submitted sales can be returned.');
  await db().from('ohlq_demo_wholesale_sales').update({ status: 'returned', return_note: reason, updated_at: new Date().toISOString() }).eq('id', id);
  const link = `${await requestOrigin()}${DEMO_BASE}/wholesale/${id}`;
  const msg = await sendDemoMessage({
    requestedTo: PARTNER.email,
    subject: `Returned: direct sale ${sale.ref_no} needs a correction`,
    html: `<div style="font:15px Georgia,serif;color:#222"><p>OHLQ Agency Operations returned <b>${sale.ref_no}</b> (${escapeHtml(sale.customer_dba || sale.customer_name || '')}, ${fmtDate(sale.sales_date)}).</p>
      <p style="background:#f6f6f6;padding:10px;border-left:4px solid #B72B35">${escapeHtml(reason)}</p><p><a href="${link}">Open the sale</a></p></div>`,
  });
  await addAudit('wholesale', id, OPS_ACTOR, 'Returned to supplier', `${reason} · emailed supplier (delivered to Paul)${msg.status === 'sent' ? '' : ` · ${msg.status.replace('_', ' ')}`}`);
  revalidateAll();
  return { ok: true, delivered: msg.deliveredTo };
}

// ─── Tasting applications ─────────────────────────────────────────────────────

export interface TastingInput {
  agency_id: string;
  staff_granted: string;
  event_date: string;
  start_time: string;
  end_time: string;
  conductor_name: string;
  solicitor_reg_no: string;
  reg_expires: string;
  applicant_type: ApplicantType;
  training_confirmed: boolean;
  product_codes: string[];
  employer: string; phone: string; fax: string; email: string;
  signature: Signature;
  signer_name: string;
}

/** Same rules the form shows; enforced again here. */
function tastingErrors(i: TastingInput, today: string): string[] {
  const errs: string[] = [];
  const earliest = earliestTastingDate(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.event_date)) errs.push('Choose the event date.');
  else if (i.event_date < earliest) errs.push(`The event must be at least 10 business days out. Earliest allowed: ${fmtShortDay(earliest)}.`);
  if (!/^\d{2}:\d{2}/.test(i.start_time) || !/^\d{2}:\d{2}/.test(i.end_time)) errs.push('Enter the start and end times.');
  else {
    const dur = minutesOf(i.end_time) - minutesOf(i.start_time);
    if (dur <= 0) errs.push('The end time must be after the start time (same day).');
    else if (dur > TASTING_MAX_MINUTES) errs.push('A tasting can last no more than 2 hours.');
  }
  if (!clean(i.staff_granted)) errs.push('Name the agency staff member who granted permission.');
  if (!clean(i.conductor_name)) errs.push('Name the individual conducting the tasting.');
  if (!clean(i.solicitor_reg_no)) errs.push('Enter the solicitor registration number.');
  if (!['solicitor', 'broker', 'trade_marketing'].includes(i.applicant_type)) errs.push('Choose what the applicant is.');
  if (i.applicant_type === 'trade_marketing' && !i.training_confirmed) errs.push('Confirm the ORC 4301.253 training.');
  if (i.product_codes.length === 0) errs.push('Choose at least one product to sample.');
  if (!clean(i.employer)) errs.push('Enter the employer.');
  if (!isSignature(i.signature)) errs.push('Sign the application.');
  if (!clean(i.signer_name)) errs.push('Type your name under the signature.');
  return errs;
}

export async function submitTasting(input: TastingInput): Promise<Result<{ id: string; delivered: string }>> {
  await assertDemoAccess();
  const errs = tastingErrors(input, todayET());
  if (errs.length) return fail(errs.join(' '));
  const agency = (await getAgencies()).find((a) => a.id === clean(input.agency_id, 10));
  if (!agency) return fail('Choose a contract liquor agency from the list.');
  const book = new Map((await getProducts()).map((p) => [p.code, p]));
  const products = input.product_codes.filter((c) => book.has(c)).map((c) => ({ code: c, name: book.get(c)!.name }));
  const now = new Date().toISOString();
  const { data, error } = await db().from('ohlq_demo_tastings').insert({
    ref_no: await nextRef('TA'), supplier_name: PARTNER.name, status: 'submitted',
    agency_id: agency.id, agency_name: agency.name, agency_address: agency.address, agency_city: agency.city, agency_zip: agency.zip, agency_county: agency.county,
    staff_granted: clean(input.staff_granted), event_date: input.event_date, start_time: input.start_time, end_time: input.end_time,
    conductor_name: clean(input.conductor_name), solicitor_reg_no: clean(input.solicitor_reg_no, 40), reg_expires: input.reg_expires || null,
    applicant_type: input.applicant_type, training_confirmed: input.applicant_type === 'trade_marketing' && !!input.training_confirmed,
    products, employer: clean(input.employer), phone: nullable(input.phone, 40), fax: nullable(input.fax, 40), email: nullable(input.email, 120),
    applicant_signature: input.signature, applicant_signer_name: clean(input.signer_name), signed_at: now, submitted_at: now,
  }).select('id, ref_no').single();
  if (error) return fail(error.message);

  // Applicant profile — pre-fills the next application
  await setSetting('applicant_profile', {
    employer: clean(input.employer), phone: clean(input.phone, 40), fax: clean(input.fax, 40), email: clean(input.email, 120),
    conductor_name: clean(input.conductor_name), solicitor_reg_no: clean(input.solicitor_reg_no, 40), reg_expires: input.reg_expires || '',
    applicant_type: input.applicant_type, signer_name: clean(input.signer_name),
  });
  await addAudit('tasting', data.id, `${PARTNER.name} (applicant)`, 'Submitted application', await device());

  const t = (await getTasting(data.id))!;
  const pdf = Buffer.from(await renderTastingPdf(t));
  const msg = await sendDemoMessage({
    requestedTo: clean(input.email, 120) || PARTNER.email,
    subject: `Tasting application ${data.ref_no} received — ${agency.name} #${agency.id}, ${fmtDate(input.event_date)}`,
    html: `<div style="font:15px Georgia,serif;color:#222"><p>OHLQ received your application to conduct a spirituous liquor tasting.</p>
      <p><b>${escapeHtml(agency.name)}</b> (Agency #${agency.id}), ${escapeHtml(agency.city)}<br>${fmtDate(input.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${fmtTime(input.start_time)}–${fmtTime(input.end_time)}</p>
      <p>You&rsquo;ll get an email when Agency Operations approves or rejects it. A copy of the application (LIQ-19-0004) is attached.</p></div>`,
    attachments: [{ filename: `LIQ-19-0004 ${data.ref_no}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  revalidateAll();
  return { ok: true, id: data.id, delivered: msg.deliveredTo };
}

export async function decideTasting(id: string, decision: 'approved' | 'rejected', note: string): Promise<Result<{ delivered: string }>> {
  await assertDemoAccess();
  const t = await getTasting(id);
  if (!t || t.status !== 'submitted') return fail('Only pending applications can be decided.');
  const reason = clean(note, 1000);
  if (decision === 'rejected' && !reason) return fail('A reason is required to reject.');
  await db().from('ohlq_demo_tastings').update({ status: decision, decided_at: new Date().toISOString(), decision_note: reason || (decision === 'approved' ? 'Approved' : null) }).eq('id', id);
  const updated = (await getTasting(id))!;
  const pdf = Buffer.from(await renderTastingPdf(updated));
  const approved = decision === 'approved';
  const msg = await sendDemoMessage({
    requestedTo: t.email || PARTNER.email,
    subject: `Tasting ${approved ? 'APPROVED' : 'REJECTED'}: ${t.agency_name} #${t.agency_id}, ${fmtDate(t.event_date)}`,
    html: `<div style="font:15px Georgia,serif;color:#222"><p>Your tasting application <b>${t.ref_no}</b> was <b style="color:${approved ? '#1e6b34' : '#B72B35'}">${approved ? 'approved' : 'rejected'}</b> by OHLQ Agency Operations.</p>
      <p><b>${escapeHtml(t.agency_name ?? '')}</b> (Agency #${t.agency_id})<br>${fmtDate(t.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${fmtTime(t.start_time)}–${fmtTime(t.end_time)}</p>
      ${reason ? `<p style="background:#f6f6f6;padding:10px;border-left:4px solid #B72B35">${escapeHtml(reason)}</p>` : ''}
      <p>The completed form, including the Division Use section, is attached.</p></div>`,
    attachments: [{ filename: `LIQ-19-0004 ${t.ref_no} ${approved ? 'approved' : 'rejected'}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  await addAudit('tasting', id, OPS_ACTOR, approved ? 'Approved' : 'Rejected', `${reason ? `${reason} · ` : ''}applicant emailed (delivered to Paul)${msg.status === 'sent' ? '' : ` · ${msg.status.replace('_', ' ')}`}`);
  revalidateAll();
  return { ok: true, delivered: msg.deliveredTo };
}

/** Used by the PDF route for "email me the PDF" — kept here so the A-3a renderer is exercised server-side. */
export async function emailSalePdf(id: string): Promise<Result<{ delivered: string }>> {
  await assertDemoAccess();
  const sale = await getSale(id);
  if (!sale) return fail('Sale not found.');
  const pdf = Buffer.from(await renderA3aPdf(sale));
  const msg = await sendDemoMessage({
    requestedTo: PARTNER.email, subject: `A-3a ${sale.ref_no} PDF`,
    html: `<p style="font:15px Georgia,serif">The A-3a Direct Sale to Wholesale Customer form for ${sale.ref_no} is attached.</p>`,
    attachments: [{ filename: `A-3a ${sale.ref_no}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
  return { ok: true, delivered: msg.deliveredTo };
}

export async function getSinConfigAction() {
  await assertDemoAccess();
  return getSinTaxConfig();
}

export async function allTastingsForConflicts() {
  await assertDemoAccess();
  return getTastings();
}
