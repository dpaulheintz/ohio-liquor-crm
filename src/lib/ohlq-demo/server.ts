// OHLQ Ops concept demo — server-side data access. Service role only (the ohlq_demo_* tables have
// RLS on and no policies, so the browser can't touch them directly). The demo itself is public. Reads ohlq_products and agency rows of accounts read-only.
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import {
  DEFAULT_SIN_TAX, tastingFlags, toCents, wholesaleFlags,
  type Agency, type AuditEntry, type Customer, type Product, type Sale, type SinTaxConfig, type Tasting,
} from './shared';

export const db = () => createAdminClient();

export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// ─── Reference data (read-only) ───────────────────────────────────────────────

function sizeLabel(volumeL: number, name: string): string {
  if (/sample pack/i.test(name)) return 'Pack';
  if (volumeL >= 1) return `${Number(volumeL.toFixed(2))} L`;
  return `${Math.round(volumeL * 1000)} mL`;
}

/** The supplier's price book. `delisted` rows are kept only so Ops can flag them; forms hide them. */
export async function getPriceBook(): Promise<(Product & { delisted: boolean })[]> {
  const { data, error } = await db()
    .from('ohlq_products')
    .select('sku, item_name, display_name, status, volume_l, wholesale_price, retail_price, sort_order')
    .order('sku');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const volumeL = Number(r.volume_l ?? 0);
    const name = String(r.display_name ?? r.item_name).replace(/\s+\d+(\.\d+)?\s*(mL|L)$/i, '');
    return {
      code: String(r.sku),
      name,
      size: sizeLabel(volumeL, name),
      volumeL,
      priceCents: toCents(r.wholesale_price),
      retailCents: toCents(r.retail_price),
      status: String(r.status ?? ''),
      delisted: /de-?listed/i.test(String(r.status ?? '')),
    };
  });
}

export async function getProducts(): Promise<Product[]> {
  return (await getPriceBook()).filter((p) => !p.delisted).map((p) => ({
    code: p.code, name: p.name, size: p.size, volumeL: p.volumeL, priceCents: p.priceCents, retailCents: p.retailCents, status: p.status,
  }));
}

/** Agency list: only agency number, name, address, city, zip (+ county for the calendar filter). */
export async function getAgencies(): Promise<Agency[]> {
  const { data, error } = await db()
    .from('accounts')
    .select('agency_id, display_name, address, city, zip, county')
    .eq('type', 'agency')
    .not('agency_id', 'is', null)
    .order('agency_id');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.agency_id), name: String(r.display_name ?? ''), address: String(r.address ?? ''),
    city: String(r.city ?? ''), zip: String(r.zip ?? ''), county: r.county ? String(r.county) : null,
  }));
}

// ─── Demo data ────────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  const { data, error } = await db().from('ohlq_demo_customers').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Customer[];
}

const SALE_SELECT = '*, lines:ohlq_demo_wholesale_lines(*)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSale(r: any): Sale {
  return {
    ...r,
    subtotal_cents: Number(r.subtotal_cents), sin_tax_cents: Number(r.sin_tax_cents), total_cents: Number(r.total_cents),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: ((r.lines ?? []) as any[]).map((l) => ({ ...l, line_total_cents: Number(l.line_total_cents), volume_l: l.volume_l == null ? null : Number(l.volume_l) }))
      .sort((a, b) => a.sort_order - b.sort_order),
  } as Sale;
}

export async function getSales(): Promise<Sale[]> {
  const { data, error } = await db().from('ohlq_demo_wholesale_sales').select(SALE_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSale);
}

export async function getSale(id: string): Promise<Sale | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from('ohlq_demo_wholesale_sales').select(SALE_SELECT).eq('id', id).maybeSingle();
  return data ? mapSale(data) : null;
}

export async function getSaleByToken(token: string): Promise<Sale | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const { data } = await db().from('ohlq_demo_wholesale_sales').select(SALE_SELECT).eq('sign_token', token).maybeSingle();
  return data ? mapSale(data) : null;
}

export async function getTastings(): Promise<Tasting[]> {
  const { data, error } = await db().from('ohlq_demo_tastings').select('*').order('event_date').order('start_time');
  if (error) throw error;
  return (data ?? []) as Tasting[];
}

export async function getTasting(id: string): Promise<Tasting | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from('ohlq_demo_tastings').select('*').eq('id', id).maybeSingle();
  return (data as Tasting) ?? null;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await db().from('ohlq_demo_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  const { error } = await db().from('ohlq_demo_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export const getSinTaxConfig = () => getSetting<SinTaxConfig>('sin_tax', DEFAULT_SIN_TAX);

export async function getAudit(entityType: 'wholesale' | 'tasting', id: string): Promise<AuditEntry[]> {
  const { data } = await db().from('ohlq_demo_audit').select('id, actor, action, detail, created_at')
    .eq('entity_type', entityType).eq('entity_id', id).order('created_at');
  return (data ?? []) as AuditEntry[];
}

export async function addAudit(entityType: 'wholesale' | 'tasting' | 'demo', entityId: string | null, actor: string, action: string, detail?: string) {
  await db().from('ohlq_demo_audit').insert({ entity_type: entityType, entity_id: entityId, actor, action, detail: detail ?? null });
}

export async function nextRef(prefix: 'WS' | 'TA'): Promise<string> {
  const table = prefix === 'WS' ? 'ohlq_demo_wholesale_sales' : 'ohlq_demo_tastings';
  const { data } = await db().from(table).select('ref_no').like('ref_no', `${prefix}-%`);
  const max = Math.max(prefix === 'WS' ? 1000 : 2000, ...(data ?? []).map((r) => Number(String(r.ref_no).split('-')[1]) || 0));
  return `${prefix}-${max + 1}`;
}

// ─── Messages: nothing is emailed or texted — each message is logged and shown on screen ──

export interface DemoMessage {
  id: string;
  channel: 'email' | 'sms';
  requested_to: string | null;
  subject: string;
  body_html: string | null;
  links: { label: string; href: string }[];
  created_at: string;
}

/** Record a message the demo "sends". It appears in the Messages section of its sale or tasting. */
export async function logDemoMessage(opts: {
  entity: { type: 'wholesale' | 'tasting'; id: string };
  requestedTo: string | null;
  channel?: 'email' | 'sms';
  subject: string;
  html: string;
  links?: { label: string; href: string }[];
}): Promise<void> {
  await db().from('ohlq_demo_messages').insert({
    channel: opts.channel ?? 'email', requested_to: opts.requestedTo, delivered_to: 'on screen (not sent)',
    subject: opts.subject, status: 'logged', entity_type: opts.entity.type, entity_id: opts.entity.id,
    body_html: opts.html, links: opts.links ?? [],
  });
}

export async function getMessages(entityType: 'wholesale' | 'tasting', id: string): Promise<DemoMessage[]> {
  const { data } = await db().from('ohlq_demo_messages').select('id, channel, requested_to, subject, body_html, links, created_at')
    .eq('entity_type', entityType).eq('entity_id', id).order('created_at', { ascending: false });
  return (data ?? []) as DemoMessage[];
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ─── Ops: queues with automatic validation flags ──────────────────────────────

export async function getOpsData() {
  const [sales, tastings, book, customers] = await Promise.all([getSales(), getTastings(), getPriceBook(), getCustomers()]);
  const ctx = {
    products: new Map(book.map((p) => [p.code, p])),
    verifiedPermits: new Set(customers.filter((c) => c.permit_verified).map((c) => c.permit_number)),
    others: sales,
  };
  return {
    book,
    sales: sales.filter((s) => ['submitted', 'processed', 'returned'].includes(s.status)).map((s) => ({ ...s, flags: wholesaleFlags(s, ctx) })),
    tastings: tastings.map((t) => ({ ...t, flags: tastingFlags(t, tastings) })),
  };
}
