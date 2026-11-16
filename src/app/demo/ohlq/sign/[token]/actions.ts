'use server';

// Customer e-signature for a direct wholesale sale. Public (no access code): the unguessable token in
// the link is the credential, and it only allows signing that one sale while it awaits a signature.
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { addAudit, db, escapeHtml, getSaleByToken, requestOrigin, sendDemoMessage } from '@/lib/ohlq-demo/server';
import { DEMO_BASE, PARTNER, describeDevice, fmtCents, isSignature, type Signature } from '@/lib/ohlq-demo/shared';

export async function signAsCustomer(token: string, input: { signature: Signature; name: string; consent: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const sale = await getSaleByToken(token);
  if (!sale) return { ok: false, error: 'This signing link is no longer valid.' };
  if (sale.status !== 'awaiting_customer') return { ok: false, error: sale.customer_signature ? 'This order was already signed.' : 'This order isn’t waiting for a signature.' };
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  if (!name) return { ok: false, error: 'Type your full name.' };
  if (!isSignature(input.signature)) return { ok: false, error: 'Draw your signature in the box.' };
  if (!input.consent) return { ok: false, error: 'Check the box to agree to sign electronically.' };
  const h = await headers();
  const dev = describeDevice(h.get('user-agent'));
  const now = new Date().toISOString();
  const { error } = await db().from('ohlq_demo_wholesale_sales').update({
    status: 'signed', customer_signature: input.signature, customer_signer_name: name, customer_signed_at: now,
    customer_device: dev, customer_consent: true, updated_at: now,
  }).eq('id', sale.id).eq('status', 'awaiting_customer');
  if (error) return { ok: false, error: 'Couldn’t save your signature. Please try again.' };
  await addAudit('wholesale', sale.id, `Customer: ${name}`, 'Customer signed electronically', `${dev} · agreed to sign electronically`);

  if (sale.sign_method !== 'in_person') {
    const link = `${await requestOrigin()}${DEMO_BASE}/wholesale/${sale.id}`;
    await sendDemoMessage({
      requestedTo: PARTNER.email,
      subject: `Signed: ${sale.customer_dba || sale.customer_name} signed ${sale.ref_no} (${fmtCents(sale.total_cents)})`,
      html: `<p style="font:15px Georgia,serif">${escapeHtml(name)} signed direct sale <b>${sale.ref_no}</b> on ${escapeHtml(dev)}. It&rsquo;s ready to submit to OHLQ.</p><p style="font:15px Georgia,serif"><a href="${link}">Open the sale</a></p>`,
    });
  }
  revalidatePath(DEMO_BASE, 'layout');
  return { ok: true };
}
