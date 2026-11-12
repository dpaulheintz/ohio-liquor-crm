// Bottle Sales Tracker: server-side loaders. Every read runs as the signed-in user, so RLS
// (bottle_sales_can_use()) applies on top of the explicit access check.
import { createClient } from '@/lib/supabase/server';
import { toCents, type BottleLocation, type OhlqProduct, type SaleLine, type SaleType } from '@/lib/bottle-sales';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function getBottleSalesAccess(): Promise<{ canUse: boolean; userId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { canUse: false, userId: null };
  const { data } = await supabase.rpc('bottle_sales_can_use');
  return { canUse: data === true, userId: user.id };
}

export async function requireBottleSalesAccess(): Promise<Supabase> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data } = await supabase.rpc('bottle_sales_can_use');
  if (data !== true) throw new Error('Not authorized');
  return supabase;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export async function loadProducts(sb: Supabase): Promise<OhlqProduct[]> {
  const { data, error } = await sb.from('ohlq_products').select('*').order('sort_order').order('sku');
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    ...p,
    proof: num(p.proof), age: num(p.age), volume_l: num(p.volume_l),
    case_price: Number(p.case_price), retail_price: Number(p.retail_price), wholesale_price: Number(p.wholesale_price),
    paid_per_bottle: Number(p.paid_per_bottle), units_per_case: Number(p.units_per_case),
  }));
}

export async function loadLocations(sb: Supabase): Promise<BottleLocation[]> {
  const { data, error } = await sb.from('bottle_locations').select('code, name, sort_order').eq('active', true).order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadFiscalStartMonth(sb: Supabase): Promise<number> {
  const { data } = await sb.from('bottle_sales_settings').select('fiscal_year_start_month').maybeSingle();
  return data?.fiscal_year_start_month ?? 11;
}

/** Every sales line (paged past PostgREST's 1,000-row cap). Money converted to integer cents. */
export async function loadLines(sb: Supabase, opts: { entryId?: string } = {}): Promise<(SaleLine & { created_at: string })[]> {
  const out: (SaleLine & { created_at: string })[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb
      .from('bottle_sales')
      .select('id, entry_id, sale_date, location_code, type, sku, bottles, units_per_case, paid_per_bottle, paid_amount, wholesale_amount, retail_amount, source, notes, created_at')
      .order('sale_date').order('created_at').order('id')
      .range(from, from + 999);
    if (opts.entryId) q = q.eq('entry_id', opts.entryId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      out.push({
        id: r.id, entry_id: r.entry_id, sale_date: r.sale_date, location_code: r.location_code, type: r.type as SaleType,
        sku: r.sku, bottles: r.bottles, units_per_case: r.units_per_case, paid_per_bottle: Number(r.paid_per_bottle),
        paid_c: toCents(r.paid_amount), wholesale_c: toCents(r.wholesale_amount), retail_c: toCents(r.retail_amount),
        source: r.source, notes: r.notes, created_at: r.created_at,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface AuditRow { id: number; line_id: string; action: 'update' | 'delete'; old_values: Record<string, unknown>; new_values: Record<string, unknown> | null; changed_at: string; changed_by_name: string | null }

export async function loadAudit(sb: Supabase, entryId: string): Promise<AuditRow[]> {
  const { data, error } = await sb
    .from('bottle_sales_audit')
    .select('id, line_id, action, old_values, new_values, changed_at, by:profiles!bottle_sales_audit_changed_by_fkey(full_name, email)')
    .eq('entry_id', entryId)
    .order('changed_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map(({ by, ...r }: any) => ({ ...r, changed_by_name: by ? by.full_name || by.email : null }));
}
