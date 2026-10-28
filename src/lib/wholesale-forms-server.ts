import { createClient } from '@/lib/supabase/server';
import type {
  WholesaleCustomer,
  WholesaleForm,
  WholesaleFormLine,
  WholesaleProduct,
  WholesaleSettings,
  WholesaleWarehouse,
} from '@/lib/wholesale-forms';
import { DEFAULT_EMAIL_RECIPIENTS, pdfFileName, warehouseSnapshot } from '@/lib/wholesale-forms';
import { renderWholesaleFormPdf } from '@/lib/wholesale-forms-pdf';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface WholesaleAccess {
  canUse: boolean;
  isAdmin: boolean;
  userId: string | null;
}

export async function getWholesaleAccess(supabase?: Supabase): Promise<WholesaleAccess> {
  const sb = supabase ?? (await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { canUse: false, isAdmin: false, userId: null };
  const [{ data: canUse }, { data: isAdmin }] = await Promise.all([
    sb.rpc('can_use_wholesale_forms'),
    sb.rpc('is_admin'),
  ]);
  return { canUse: canUse === true, isAdmin: isAdmin === true, userId: user.id };
}

/** Throws unless the caller may use Wholesale Forms (admins only when adminOnly). */
export async function requireWholesaleAccess(opts: { adminOnly?: boolean } = {}) {
  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.canUse || (opts.adminOnly && !access.isAdmin)) throw new Error('Not authorized');
  return { supabase, access };
}

const FORM_COLUMNS = `
  id, sales_date, customer_id, warehouse_id, recipient_name, recipient_address_line1, recipient_city, recipient_state,
  recipient_zip, recipient_phone, account_type, account_number, customer_id_number, total_bottles,
  receipt_total_cents, status, finalized_at, notes, source, signed_copy_path, settings_snapshot, created_at, updated_at,
  completer:profiles!wholesale_forms_completed_by_fkey(full_name, email),
  sends:wholesale_form_sends(sent_at)
`;

const LINE_COLUMNS = 'id, product_id, brand_code, description, unit_type, price_cents, quantity, line_total_cents, sort_order';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toForm(row: any, lines: WholesaleFormLine[]): WholesaleForm {
  const { completer, sends, ...rest } = row;
  const sentAts: string[] = (sends ?? []).map((x: { sent_at: string }) => x.sent_at).sort();
  return {
    ...rest,
    last_sent_at: sentAts.at(-1) ?? null,
    total_bottles: Number(rest.total_bottles),
    receipt_total_cents: Number(rest.receipt_total_cents),
    completed_by_name: completer ? completer.full_name || completer.email : null,
    lines,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLine(l: any): WholesaleFormLine {
  return { ...l, price_cents: Number(l.price_cents), quantity: Number(l.quantity), line_total_cents: Number(l.line_total_cents) };
}

export async function loadForm(supabase: Supabase, id: string): Promise<WholesaleForm | null> {
  const [{ data: form, error }, { data: lines, error: lineErr }] = await Promise.all([
    supabase.from('wholesale_forms').select(FORM_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('wholesale_form_lines').select(LINE_COLUMNS).eq('form_id', id).order('sort_order'),
  ]);
  if (error) throw new Error(error.message);
  if (lineErr) throw new Error(lineErr.message);
  if (!form) return null;
  return toForm(form, (lines ?? []).map(toLine));
}

export async function loadFormHistory(supabase: Supabase): Promise<Omit<WholesaleForm, 'lines'>[]> {
  const { data, error } = await supabase
    .from('wholesale_forms')
    .select(FORM_COLUMNS)
    .order('sales_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (data ?? []).map((r) => { const { lines, ...f } = toForm(r, []); return f; });
}

export async function loadProducts(supabase: Supabase, includeInactive = false): Promise<WholesaleProduct[]> {
  let q = supabase.from('wholesale_products').select('id, brand_code, description, unit_type, price_cents, sort_order, active');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q.order('sort_order').order('brand_code');
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...p, price_cents: Number(p.price_cents) }));
}

export async function loadCustomers(supabase: Supabase, includeArchived = false): Promise<WholesaleCustomer[]> {
  let q = supabase
    .from('wholesale_customers')
    .select('id, name, address_line1, city, state, zip, phone, account_type, account_number, customer_id_number, crm_account_id, notes, default_warehouse_id, times_used, last_used_at, archived, created_at, crm:accounts(display_name)');
  if (!includeArchived) q = q.eq('archived', false);
  const [{ data, error }, { data: forms, error: formErr }] = await Promise.all([
    q.order('last_used_at', { ascending: false, nullsFirst: false }).order('name'),
    supabase.from('wholesale_forms').select('customer_id, sales_date').eq('status', 'final').not('customer_id', 'is', null),
  ]);
  if (error) throw new Error(error.message);
  if (formErr) throw new Error(formErr.message);

  const lastOrder = new Map<string, string>();
  for (const f of forms ?? []) {
    const prev = lastOrder.get(f.customer_id as string);
    if (!prev || f.sales_date > prev) lastOrder.set(f.customer_id as string, f.sales_date);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map(({ crm, ...c }: any) => ({
    ...c,
    crm_account_name: crm?.display_name ?? null,
    last_order_date: lastOrder.get(c.id) ?? null,
  }));
}

export async function loadWarehouses(supabase: Supabase): Promise<WholesaleWarehouse[]> {
  const { data, error } = await supabase
    .from('wholesale_warehouses')
    .select('id, name, label, agency_number, a3a_name, a3a_address, a3a_phone, a3a_email, is_default, sort_order')
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** A-3a details of the default warehouse (Grandview) — fallback for forms without a snapshot. */
export async function loadSettings(supabase: Supabase): Promise<WholesaleSettings> {
  const warehouses = await loadWarehouses(supabase);
  const w = warehouses.find((x) => x.is_default) ?? warehouses[0];
  if (!w) throw new Error('No warehouse profiles are set up.');
  return warehouseSnapshot(w);
}

export async function loadEmailRecipients(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase.from('wholesale_form_settings').select('email_recipients').single();
  if (error) throw new Error(error.message);
  return data.email_recipients?.length ? data.email_recipients : DEFAULT_EMAIL_RECIPIENTS;
}

/** The form's PDF, rendered from its own snapshot (recipient, prices, A-3a info). */
export async function renderFormPdf(supabase: Supabase, form: WholesaleForm): Promise<{ bytes: Uint8Array; filename: string }> {
  const settings = form.settings_snapshot ?? (await loadSettings(supabase));
  const bytes = await renderWholesaleFormPdf(form, settings);
  return { bytes, filename: pdfFileName(form.sales_date, form.recipient_name) };
}
