'use server';

import { revalidatePath } from 'next/cache';
import { loadEmailRecipients, loadForm, renderFormPdf, requireWholesaleAccess } from '@/lib/wholesale-forms-server';
import { sendEmailStrict } from '@/lib/email';
import {
  WHOLESALE_BUCKET,
  WHOLESALE_FORMS_PATH,
  emailSubject,
  formatCents,
  isEmail,
  type AccountType,
  type CustomLineInput,
  type FormStatus,
} from '@/lib/wholesale-forms';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CustomerInput {
  name: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  account_type: AccountType;
  account_number: string;
  customer_id_number: string;
  crm_account_id?: string | null;
  notes?: string;
}

export interface SaveFormInput {
  formId: string | null;
  status: FormStatus;
  salesDate: string;
  customerId: string | null;
  recipient: CustomerInput;
  /** Create the wholesaler (when none is selected) or update the selected one with these fields. */
  saveToDirectory: boolean;
  quantities: Record<string, number>;
  /** One-off lines typed on this form; save_to_price_list (admins) also adds the SKU to the price list. */
  customLines: (CustomLineInput & { save_to_price_list?: boolean })[];
  warehouseId: string | null;
  notes: string;
}

function revalidate() {
  revalidatePath(WHOLESALE_FORMS_PATH, 'layout');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function friendly(err: any): string {
  const msg = String(err?.message ?? err ?? 'Something went wrong');
  if (msg.includes('wholesale_forms_final_complete')) return 'A form needs a recipient and at least one bottle before it can be finalized.';
  if (msg.includes('wholesale_customers_account_number_key')) return 'That account # is already saved for another wholesaler.';
  if (msg.includes('Not authorized') || err?.code === '42501') return 'You don’t have permission to do that.';
  return msg;
}

function customerRow(c: CustomerInput) {
  return {
    name: c.name.trim(),
    address_line1: c.address_line1,
    city: c.city,
    state: c.state || 'OH',
    zip: c.zip,
    phone: c.phone,
    account_type: c.account_type === 'transient' ? 'transient' : 'wholesale',
    account_number: c.account_number,
    customer_id_number: c.customer_id_number,
    ...(c.crm_account_id !== undefined ? { crm_account_id: c.crm_account_id || null } : {}),
    ...(c.notes !== undefined ? { notes: c.notes } : {}),
  };
}

// ─── Forms ────────────────────────────────────────────────────────────────────

export async function saveWholesaleForm(input: SaveFormInput): Promise<ActionResult<{ id: string; customerId: string | null; warning?: string }>> {
  try {
    const { supabase, access } = await requireWholesaleAccess();

    if (!DATE_RE.test(input.salesDate)) return { ok: false, error: 'Enter a valid sales date.' };
    if (input.formId && !UUID_RE.test(input.formId)) return { ok: false, error: 'Invalid form.' };
    if (input.customerId && !UUID_RE.test(input.customerId)) return { ok: false, error: 'Invalid wholesaler.' };
    if (input.warehouseId && !UUID_RE.test(input.warehouseId)) return { ok: false, error: 'Invalid warehouse.' };

    const customLines: CustomLineInput[] = [];
    const toPriceList: CustomLineInput[] = [];
    for (const c of input.customLines ?? []) {
      const line = {
        brand_code: String(c.brand_code ?? '').trim().toUpperCase().slice(0, 20),
        description: String(c.description ?? '').trim().slice(0, 120),
        unit_type: String(c.unit_type ?? '').trim().slice(0, 20) || 'Bottles',
        price_cents: c.price_cents,
        quantity: c.quantity,
      };
      if (!line.brand_code || !line.description) return { ok: false, error: 'Each added item needs a brand code and description.' };
      if (!Number.isSafeInteger(line.price_cents) || line.price_cents < 0 || line.price_cents > 99_999_999) return { ok: false, error: `Enter a valid price for ${line.brand_code}.` };
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 0 || line.quantity > 99999) return { ok: false, error: 'Quantities must be whole numbers of bottles.' };
      customLines.push(line);
      if (c.save_to_price_list) toPriceList.push(line);
    }
    if (customLines.length > 50) return { ok: false, error: 'Too many added items.' };
    if (toPriceList.length && !access.isAdmin) return { ok: false, error: 'Only admins can add items to the price list.' };

    const quantities: Record<string, number> = {};
    let bottles = 0;
    for (const [productId, qty] of Object.entries(input.quantities ?? {})) {
      if (!UUID_RE.test(productId)) return { ok: false, error: 'Invalid product.' };
      if (!Number.isSafeInteger(qty) || qty < 0 || qty > 99999) return { ok: false, error: 'Quantities must be whole numbers of bottles.' };
      quantities[productId] = qty;
      bottles += qty;
    }
    bottles += customLines.reduce((s, l) => s + l.quantity, 0);

    const name = input.recipient.name.trim();
    if (input.status === 'final') {
      if (!name) return { ok: false, error: 'Choose or add a recipient before finalizing.' };
      if (bottles === 0) return { ok: false, error: 'Enter at least one bottle before finalizing.' };
    }

    let customerId = input.customerId;
    if (name && !customerId) {
      const { data, error } = await supabase.from('wholesale_customers').insert(customerRow(input.recipient)).select('id').single();
      if (error) return { ok: false, error: friendly(error) };
      customerId = data.id;
    } else if (customerId && input.saveToDirectory) {
      const { error } = await supabase.from('wholesale_customers').update(customerRow(input.recipient)).eq('id', customerId);
      if (error) return { ok: false, error: friendly(error) };
    }

    // Only admins can override the warehouse the wholesaler sets.
    if (!access.isAdmin && input.warehouseId) {
      const [{ data: customer }, { data: existing }, { data: fallback }] = await Promise.all([
        customerId ? supabase.from('wholesale_customers').select('default_warehouse_id').eq('id', customerId).maybeSingle() : Promise.resolve({ data: null }),
        input.formId ? supabase.from('wholesale_forms').select('warehouse_id').eq('id', input.formId).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('wholesale_warehouses').select('id').eq('is_default', true).maybeSingle(),
      ]);
      const allowed = [customer?.default_warehouse_id ?? fallback?.id, existing?.warehouse_id];
      if (!allowed.includes(input.warehouseId)) return { ok: false, error: 'Only admins can change the warehouse.' };
    }

    const r = input.recipient;
    const { data: id, error } = await supabase.rpc('save_wholesale_form', {
      p_form_id: input.formId,
      p_form: {
        status: input.status,
        sales_date: input.salesDate,
        customer_id: customerId ?? '',
        recipient_name: name,
        recipient_address_line1: r.address_line1,
        recipient_city: r.city,
        recipient_state: r.state || 'OH',
        recipient_zip: r.zip,
        recipient_phone: r.phone,
        account_type: r.account_type,
        account_number: r.account_number,
        customer_id_number: r.customer_id_number,
        notes: input.notes,
        warehouse_id: input.warehouseId ?? '',
        custom_lines: customLines,
      },
      p_quantities: quantities,
    });
    if (error) return { ok: false, error: friendly(error) };

    // "Save to price list": the line stays a one-off on this form; the SKU is added for future forms.
    const skipped: string[] = [];
    for (const l of toPriceList) {
      const { data: last } = await supabase.from('wholesale_products').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      const { error: pErr } = await supabase.from('wholesale_products').insert({
        brand_code: l.brand_code, description: l.description, unit_type: l.unit_type, price_cents: l.price_cents,
        active: true, sort_order: (last?.sort_order ?? 0) + 10,
      });
      if (pErr) skipped.push(pErr.code === '23505' ? `${l.brand_code} is already on the price list` : `${l.brand_code}: ${pErr.message}`);
    }

    revalidate();
    return { ok: true, data: { id: id as string, customerId, ...(skipped.length ? { warning: `Form saved, but ${skipped.join('; ')}.` } : {}) } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

/** Quantities from the wholesaler's most recent form (excluding the one being edited), keyed by product id. */
export async function getLastOrderQuantities(customerId: string, excludeFormId?: string | null): Promise<Record<string, number>> {
  if (!UUID_RE.test(customerId)) return {};
  const { supabase } = await requireWholesaleAccess();
  let q = supabase
    .from('wholesale_forms')
    .select('id')
    .eq('customer_id', customerId)
    .gt('total_bottles', 0)
    .order('sales_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (excludeFormId && UUID_RE.test(excludeFormId)) q = q.neq('id', excludeFormId);
  const { data: last } = await q.maybeSingle();
  if (!last) return {};
  const { data: lines } = await supabase
    .from('wholesale_form_lines')
    .select('product_id, quantity')
    .eq('form_id', last.id)
    .gt('quantity', 0);
  return Object.fromEntries((lines ?? []).filter((l) => l.product_id).map((l) => [l.product_id as string, Number(l.quantity)]));
}

export async function attachSignedCopy(formId: string, path: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(formId) || !path.startsWith(`forms/${formId}/`) || path.includes('..')) {
      return { ok: false, error: 'Invalid upload.' };
    }
    const { supabase } = await requireWholesaleAccess();
    const { data, error } = await supabase.from('wholesale_forms').update({ signed_copy_path: path }).eq('id', formId).select('id');
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: 'Form not found.' };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function getSignedCopyUrl(formId: string): Promise<string | null> {
  if (!UUID_RE.test(formId)) return null;
  const { supabase } = await requireWholesaleAccess();
  const { data: form } = await supabase.from('wholesale_forms').select('signed_copy_path').eq('id', formId).maybeSingle();
  if (!form?.signed_copy_path) return null;
  const { data } = await supabase.storage.from(WHOLESALE_BUCKET).createSignedUrl(form.signed_copy_path, 60 * 10);
  return data?.signedUrl ?? null;
}

// ─── Wholesalers ──────────────────────────────────────────────────────────────

export async function saveCustomer(id: string | null, input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    if (!input.name.trim()) return { ok: false, error: 'Name is required.' };
    if (id && !UUID_RE.test(id)) return { ok: false, error: 'Invalid wholesaler.' };
    const { supabase } = await requireWholesaleAccess();
    const query = id
      ? supabase.from('wholesale_customers').update(customerRow(input)).eq('id', id).select('id').single()
      : supabase.from('wholesale_customers').insert(customerRow(input)).select('id').single();
    const { data, error } = await query;
    if (error) return { ok: false, error: friendly(error) };
    revalidate();
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function setCustomerArchived(id: string, archived: boolean): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid wholesaler.' };
    const { supabase } = await requireWholesaleAccess();
    const { error } = await supabase.from('wholesale_customers').update({ archived }).eq('id', id);
    if (error) return { ok: false, error: friendly(error) };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function mergeCustomers(keepId: string, duplicateId: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(keepId) || !UUID_RE.test(duplicateId)) return { ok: false, error: 'Invalid wholesaler.' };
    const { supabase } = await requireWholesaleAccess();
    const { error } = await supabase.rpc('merge_wholesale_customers', { p_keep: keepId, p_dup: duplicateId });
    if (error) return { ok: false, error: friendly(error) };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function searchCrmAccounts(query: string): Promise<{ id: string; display_name: string; city: string | null }[]> {
  const term = query.trim().replace(/[%_,()]/g, ' ').trim();
  if (term.length < 2) return [];
  const { supabase } = await requireWholesaleAccess();
  const { data } = await supabase
    .from('accounts')
    .select('id, display_name, city')
    .ilike('display_name', `%${term}%`)
    .order('display_name')
    .limit(10);
  return data ?? [];
}

// ─── Price list (admins) ──────────────────────────────────────────────────────

export interface ProductInput {
  brand_code: string;
  description: string;
  unit_type: string;
  price_cents: number;
  active: boolean;
}

function validProduct(p: ProductInput): string | null {
  if (!p.brand_code.trim() || !p.description.trim()) return 'Brand code and description are required.';
  if (!Number.isSafeInteger(p.price_cents) || p.price_cents < 0) return 'Enter a valid price.';
  return null;
}

export async function saveProduct(id: string | null, input: ProductInput): Promise<ActionResult> {
  try {
    const invalid = validProduct(input);
    if (invalid) return { ok: false, error: invalid };
    if (id && !UUID_RE.test(id)) return { ok: false, error: 'Invalid product.' };
    const { supabase } = await requireWholesaleAccess({ adminOnly: true });
    const row = {
      brand_code: input.brand_code.trim().toUpperCase(),
      description: input.description.trim(),
      unit_type: input.unit_type.trim() || 'Bottles',
      price_cents: input.price_cents,
      active: input.active,
    };
    if (id) {
      const { data, error } = await supabase.from('wholesale_products').update(row).eq('id', id).select('id');
      if (error) return { ok: false, error: friendly(error) };
      if (!data?.length) return { ok: false, error: 'You don’t have permission to do that.' };
    } else {
      const { data: last } = await supabase.from('wholesale_products').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      const { error } = await supabase.from('wholesale_products').insert({ ...row, sort_order: (last?.sort_order ?? 0) + 10 });
      if (error) return { ok: false, error: error.code === '23505' ? 'That brand code already exists.' : friendly(error) };
    }
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function reorderProducts(orderedIds: string[]): Promise<ActionResult> {
  try {
    if (!orderedIds.every((id) => UUID_RE.test(id))) return { ok: false, error: 'Invalid product.' };
    const { supabase } = await requireWholesaleAccess({ adminOnly: true });
    for (const [i, id] of orderedIds.entries()) {
      const { error } = await supabase.from('wholesale_products').update({ sort_order: (i + 1) * 10 }).eq('id', id);
      if (error) return { ok: false, error: friendly(error) };
    }
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteWholesaleForm(formId: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(formId)) return { ok: false, error: 'Invalid form.' };
    const { supabase } = await requireWholesaleAccess();
    // RLS: drafts for anyone using the module, finalized forms for admins only.
    const { data, error } = await supabase.from('wholesale_forms').delete().eq('id', formId).select('id');
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: 'Only admins can delete a finalized form.' };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

// ─── Send by email ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function getEmailRecipients(): Promise<string[]> {
  const { supabase } = await requireWholesaleAccess();
  return loadEmailRecipients(supabase);
}

export async function sendWholesaleForm(formId: string): Promise<ActionResult<{ sentAt: string; recipients: string[] }>> {
  try {
    if (!UUID_RE.test(formId)) return { ok: false, error: 'Invalid form.' };
    const { supabase, access } = await requireWholesaleAccess();
    const form = await loadForm(supabase, formId);
    if (!form) return { ok: false, error: 'Form not found.' };
    if (form.status !== 'final') return { ok: false, error: 'Finalize the form before sending it.' };

    const recipients = await loadEmailRecipients(supabase);
    const { bytes, filename } = await renderFormPdf(supabase, form);
    const subject = emailSubject(form.recipient_name, form.sales_date, form.receipt_total_cents);
    const warehouse = form.settings_snapshot?.warehouse_name ?? form.settings_snapshot?.warehouse_label ?? 'Grandview';
    const summary = `${warehouse} warehouse · ${form.total_bottles} bottle${form.total_bottles === 1 ? '' : 's'} · ${formatCents(form.receipt_total_cents)} · completed by ${form.completed_by_name ?? '—'}`;

    await sendEmailStrict({
      to: recipients,
      subject,
      text: `${summary}\n\nThe wholesale form PDF is attached.`,
      html: `<p>${esc(summary)}</p><p>The wholesale form PDF is attached.</p>`,
      fromName: 'High Bank Wholesale Forms',
      attachments: [{ filename, content: Buffer.from(bytes), contentType: 'application/pdf' }],
    });

    const { data: sent, error } = await supabase
      .from('wholesale_form_sends')
      .insert({ form_id: formId, sent_by: access.userId, recipients, subject })
      .select('sent_at')
      .single();
    if (error) return { ok: false, error: `Email sent, but logging it failed: ${friendly(error)}` };
    revalidate();
    return { ok: true, data: { sentAt: sent.sent_at, recipients } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

// ─── Settings (admins): warehouse profiles + email recipients ────────────────

export interface WarehouseInput {
  label: string;
  agency_number: string;
  a3a_name: string;
  a3a_address: string;
  a3a_phone: string;
  a3a_email: string;
}

export async function saveWarehouse(id: string, input: WarehouseInput): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid warehouse.' };
    const keys: (keyof WarehouseInput)[] = ['label', 'agency_number', 'a3a_name', 'a3a_address', 'a3a_phone', 'a3a_email'];
    const row = Object.fromEntries(keys.map((k) => [k, String(input[k] ?? '').trim()])) as unknown as WarehouseInput;
    if (keys.some((k) => !row[k])) return { ok: false, error: 'All fields are required.' };
    if (!isEmail(row.a3a_email)) return { ok: false, error: 'Enter a valid A-3a email address.' };
    row.label = row.label.toUpperCase();
    const { supabase, access } = await requireWholesaleAccess({ adminOnly: true });
    const { data, error } = await supabase
      .from('wholesale_warehouses')
      .update({ ...row, updated_by: access.userId })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: 'You don’t have permission to do that.' };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function saveEmailRecipients(recipients: string[]): Promise<ActionResult> {
  try {
    const list = [...new Set((recipients ?? []).map((r) => String(r).trim().toLowerCase()).filter(Boolean))];
    if (list.length === 0) return { ok: false, error: 'Add at least one recipient.' };
    if (list.length > 10) return { ok: false, error: 'Up to 10 recipients.' };
    const bad = list.find((r) => !isEmail(r));
    if (bad) return { ok: false, error: `“${bad}” isn’t a valid email address.` };
    const { supabase, access } = await requireWholesaleAccess({ adminOnly: true });
    const { data, error } = await supabase
      .from('wholesale_form_settings')
      .update({ email_recipients: list, updated_by: access.userId })
      .eq('id', true)
      .select('id');
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: 'You don’t have permission to do that.' };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
