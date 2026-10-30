'use server';

import { revalidatePath } from 'next/cache';
import { sendEmailStrict } from '@/lib/email';
import { loadEmailRecipients } from '@/lib/wholesale-forms-server';
import { loadRequisition, renderRequisitionPdf, requireRetailReqAccess } from '@/lib/retail-requisitions-server';
import {
  REQ_LOCATIONS,
  REQ_PURPOSES,
  RETAIL_REQ_PATH,
  requisitionEmailSubject,
  type ReqStatus,
} from '@/lib/retail-requisitions';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QTY = 99999;

export interface CustomReqLine {
  sku: string;
  description: string;
  quantity: number;
  save_to_list?: boolean;
}

export interface SaveRequisitionInput {
  id: string | null;
  status: ReqStatus;
  location: string;
  purpose: string;
  reqDate: string;
  notes: string;
  quantities: Record<string, number>;
  customLines: CustomReqLine[];
}

function revalidate() {
  revalidatePath(RETAIL_REQ_PATH, 'layout');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function friendly(err: any): string {
  const msg = String(err?.message ?? err ?? 'Something went wrong');
  if (msg.includes('retail_requisition_final_needs_items')) return 'Add at least one item before finalizing.';
  if (msg.includes('retail_req_products_sku_key')) return 'That SKU is already on the list.';
  if (msg.includes('row-level security') || msg.includes('Not authorized')) return 'You don’t have permission to do that.';
  return msg;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function saveRequisition(input: SaveRequisitionInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, access } = await requireRetailReqAccess();

    if (input.id && !UUID_RE.test(input.id)) return { ok: false, error: 'Invalid requisition.' };
    if (input.status !== 'draft' && input.status !== 'final') return { ok: false, error: 'Invalid status.' };
    if (!(REQ_LOCATIONS as readonly string[]).includes(input.location)) return { ok: false, error: 'Pick a location.' };
    if (!(REQ_PURPOSES as readonly string[]).includes(input.purpose)) {
      // An older purpose is only accepted on the requisition that already has it.
      const { data: existing } = input.id
        ? await supabase.from('retail_requisitions').select('purpose').eq('id', input.id).maybeSingle()
        : { data: null };
      if (existing?.purpose !== input.purpose) return { ok: false, error: 'Pick a purpose.' };
    }
    if (!DATE_RE.test(input.reqDate)) return { ok: false, error: 'Enter a valid date.' };

    let items = 0;
    const quantities: Record<string, number> = {};
    for (const [productId, qty] of Object.entries(input.quantities ?? {})) {
      if (!UUID_RE.test(productId)) return { ok: false, error: 'Invalid item.' };
      if (!Number.isSafeInteger(qty) || qty < 0 || qty > MAX_QTY) return { ok: false, error: 'Quantities must be whole numbers.' };
      if (qty > 0) quantities[productId] = qty;
      items += qty;
    }

    const custom: CustomReqLine[] = [];
    for (const c of input.customLines ?? []) {
      const sku = String(c.sku ?? '').trim().toUpperCase().slice(0, 20);
      const description = String(c.description ?? '').trim().slice(0, 120);
      if (!sku || !description) return { ok: false, error: 'Each added item needs a SKU and description.' };
      if (!Number.isSafeInteger(c.quantity) || c.quantity < 1 || c.quantity > MAX_QTY) return { ok: false, error: `Enter a quantity for ${sku}.` };
      if (c.save_to_list && !access.isAdmin) return { ok: false, error: 'Only admins can add items to the SKU list.' };
      custom.push({ sku, description, quantity: c.quantity, save_to_list: !!c.save_to_list });
      items += c.quantity;
    }
    if (custom.length > 50) return { ok: false, error: 'Too many added items.' };
    if (input.status === 'final' && items === 0) return { ok: false, error: 'Add at least one item before finalizing.' };

    const { data: id, error } = await supabase.rpc('save_retail_requisition', {
      p_id: input.id,
      p_req: {
        status: input.status,
        location: input.location,
        purpose: input.purpose,
        req_date: input.reqDate,
        notes: String(input.notes ?? '').slice(0, 2000),
      },
      p_quantities: quantities,
      p_custom: custom,
    });
    if (error) return { ok: false, error: friendly(error) };
    revalidate();
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

/** Lines of the most recent requisition for this location + purpose ("Repeat last"). */
export async function getLastRequisition(
  location: string,
  purpose: string,
  excludeId?: string | null,
): Promise<{ req_date: string; lines: { sku: string; description: string; quantity: number }[] } | null> {
  const { supabase } = await requireRetailReqAccess();
  let q = supabase
    .from('retail_requisitions')
    .select('id, req_date, lines:retail_requisition_lines!inner(sku, description, quantity, sort_order)')
    .eq('location', location)
    .eq('purpose', purpose)
    .order('req_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (excludeId && UUID_RE.test(excludeId)) q = q.neq('id', excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const lines = [...data.lines].sort((a, b) => a.sort_order - b.sort_order);
  return { req_date: data.req_date, lines: lines.map(({ sku, description, quantity }) => ({ sku, description, quantity })) };
}

export async function deleteRequisition(id: string): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid requisition.' };
    const { supabase } = await requireRetailReqAccess();
    const { data, error } = await supabase.from('retail_requisitions').delete().eq('id', id).select('id');
    if (error) return { ok: false, error: friendly(error) };
    if (!data?.length) return { ok: false, error: 'Only admins can delete a finalized requisition.' };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function sendRequisition(id: string): Promise<ActionResult<{ sentAt: string; recipients: string[] }>> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid requisition.' };
    const { supabase, access } = await requireRetailReqAccess();
    const req = await loadRequisition(supabase, id);
    if (!req) return { ok: false, error: 'Requisition not found.' };
    if (req.status !== 'final') return { ok: false, error: 'Finalize the requisition before sending it.' };

    const recipients = await loadEmailRecipients(supabase);
    const { bytes, filename } = await renderRequisitionPdf(supabase, req);
    const subject = requisitionEmailSubject(req);
    const summary = `${req.location} · ${req.purpose} · ${req.total_items} item${req.total_items === 1 ? '' : 's'} · requested by ${req.requested_by_name ?? '—'}`;

    await sendEmailStrict({
      to: recipients,
      subject,
      text: `${summary}\n\nThe retail requisition PDF is attached.`,
      html: `<p>${esc(summary)}</p><p>The retail requisition PDF is attached.</p>`,
      fromName: 'High Bank Retail Requisitions',
      attachments: [{ filename, content: Buffer.from(bytes), contentType: 'application/pdf' }],
    });

    const { data: sent, error } = await supabase
      .from('retail_requisition_sends')
      .insert({ requisition_id: id, sent_by: access.userId, recipients, subject })
      .select('sent_at')
      .single();
    if (error) return { ok: false, error: `Email sent, but logging it failed: ${friendly(error)}` };
    const { error: updateError } = await supabase
      .from('retail_requisitions')
      .update({ sent_at: sent.sent_at, sent_by: access.userId, sent_to: recipients })
      .eq('id', id);
    if (updateError) return { ok: false, error: `Email sent, but logging it failed: ${friendly(updateError)}` };
    revalidate();
    return { ok: true, data: { sentAt: sent.sent_at, recipients } };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

// ─── SKU list (admins) ────────────────────────────────────────────────────────

export async function saveReqProduct(id: string | null, input: { sku: string; description: string }): Promise<ActionResult> {
  try {
    if (id && !UUID_RE.test(id)) return { ok: false, error: 'Invalid item.' };
    const sku = String(input.sku ?? '').trim().toUpperCase().slice(0, 20);
    const description = String(input.description ?? '').trim().slice(0, 120);
    if (!sku || !description) return { ok: false, error: 'Enter a SKU and description.' };
    const { supabase } = await requireRetailReqAccess({ adminOnly: true });
    if (id) {
      const { error } = await supabase.from('retail_req_products').update({ sku, description }).eq('id', id);
      if (error) return { ok: false, error: friendly(error) };
    } else {
      const { data: last } = await supabase.from('retail_req_products').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      const { error } = await supabase.from('retail_req_products').insert({ sku, description, sort_order: (last?.sort_order ?? 0) + 1 });
      if (error) return { ok: false, error: friendly(error) };
    }
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

export async function setReqProductActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid item.' };
    const { supabase } = await requireRetailReqAccess({ adminOnly: true });
    const { error } = await supabase.from('retail_req_products').update({ active }).eq('id', id);
    if (error) return { ok: false, error: friendly(error) };
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}

/** Swaps an item with its neighbor in the list. */
export async function moveReqProduct(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    if (!UUID_RE.test(id)) return { ok: false, error: 'Invalid item.' };
    const { supabase } = await requireRetailReqAccess({ adminOnly: true });
    const { data, error } = await supabase.from('retail_req_products').select('id, sort_order').order('sort_order').order('sku');
    if (error) return { ok: false, error: friendly(error) };
    const i = (data ?? []).findIndex((p) => p.id === id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= data.length) return { ok: true, data: null };
    // Positions, not the stored values, so items that share a sort_order still move.
    const list = [...data];
    [list[i], list[j]] = [list[j], list[i]];
    for (const [index, p] of list.entries()) {
      if (p.sort_order !== index + 1) {
        const { error: e } = await supabase.from('retail_req_products').update({ sort_order: index + 1 }).eq('id', p.id);
        if (e) return { ok: false, error: friendly(e) };
      }
    }
    revalidate();
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
