import { createClient } from '@/lib/supabase/server';
import { renderRetailRequisitionPdf } from '@/lib/retail-requisitions-pdf';
import { requisitionFileName, type RetailReqLine, type RetailReqProduct, type RetailRequisition, type RetailRequisitionSummary } from '@/lib/retail-requisitions';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface RetailReqAccess {
  canUse: boolean;
  isAdmin: boolean;
  userId: string | null;
}

export async function getRetailReqAccess(supabase?: Supabase): Promise<RetailReqAccess> {
  const sb = supabase ?? (await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { canUse: false, isAdmin: false, userId: null };
  const [{ data: canUse }, { data: isAdmin }] = await Promise.all([
    sb.rpc('can_use_retail_requisitions'),
    sb.rpc('is_admin'),
  ]);
  return { canUse: canUse === true, isAdmin: isAdmin === true, userId: user.id };
}

/** Throws unless the caller may use Retail Requisitions (admins only when adminOnly). */
export async function requireRetailReqAccess(opts: { adminOnly?: boolean } = {}) {
  const supabase = await createClient();
  const access = await getRetailReqAccess(supabase);
  if (!access.canUse || (opts.adminOnly && !access.isAdmin)) throw new Error('Not authorized');
  return { supabase, access };
}

const REQ_COLUMNS = `
  id, location, purpose, req_date, status, notes, sent_at, sent_to, created_at, updated_at,
  requester:profiles!retail_requisitions_requested_by_fkey(full_name, email),
  lines:retail_requisition_lines(id, product_id, sku, description, quantity, sort_order)
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRequisition({ requester, lines, ...rest }: any): RetailRequisition {
  const sorted: RetailReqLine[] = [...(lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...rest,
    requested_by_name: requester ? requester.full_name || requester.email : null,
    total_items: sorted.reduce((sum, l) => sum + l.quantity, 0),
    lines: sorted,
  };
}

export async function loadRequisition(supabase: Supabase, id: string): Promise<RetailRequisition | null> {
  const { data, error } = await supabase.from('retail_requisitions').select(REQ_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRequisition(data) : null;
}

export async function loadRequisitionHistory(supabase: Supabase): Promise<RetailRequisitionSummary[]> {
  const { data, error } = await supabase
    .from('retail_requisitions')
    .select(REQ_COLUMNS)
    .order('req_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lines, ...summary } = toRequisition(row);
    return summary;
  });
}

export async function loadReqProducts(supabase: Supabase, includeInactive = false): Promise<RetailReqProduct[]> {
  let q = supabase.from('retail_req_products').select('id, sku, description, sort_order, active');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q.order('sort_order').order('sku');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function renderRequisitionPdf(supabase: Supabase, req: RetailRequisition): Promise<{ bytes: Uint8Array; filename: string }> {
  const bytes = await renderRetailRequisitionPdf(req, await loadReqProducts(supabase));
  return { bytes, filename: requisitionFileName(req) };
}
