import { NextResponse } from 'next/server';
import { addAudit, getSales } from '@/lib/ohlq-demo/server';
import { OPS_ACTOR, PARTNER, dateET } from '@/lib/ohlq-demo/shared';

export const dynamic = 'force-dynamic';

const money = (c: number) => (c / 100).toFixed(2);
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Processed direct sales, one row per line item — straight into OHLQ's system, no retyping. */
export async function GET() {
  const sales = (await getSales()).filter((s) => s.status === 'processed').sort((a, b) => a.sales_date.localeCompare(b.sales_date));
  const head = ['Ref', 'Sales Date', 'Vendor #', 'A-3a Name', 'Customer Name', 'Customer DBA', 'Permit Number', 'F2 Permit', 'Customer Address', 'City', 'State', 'Postal',
    'Brand Code', 'Product Name', 'Size', 'Quantity (Bottles)', 'Price Per Bottle', 'Item Subtotal', 'SIN Tax (invoice)', 'Invoice Total', 'A-3a Signed', 'Customer Signed', 'Processed (ET date)'];
  const rows = sales.flatMap((s) => s.lines.map((l) => [
    s.ref_no, s.sales_date, PARTNER.vendorNumber, s.supplier_name, s.customer_name, s.customer_dba, s.permit_number, s.is_f2 ? 'Y' : 'N',
    s.customer_address, s.customer_city, 'OH', s.customer_zip,
    l.brand_code, l.description, l.size_label, l.quantity, money(l.price_cents), money(l.line_total_cents), money(s.sin_tax_cents), money(s.total_cents),
    s.a3a_signed_at, s.customer_signed_at, s.processed_at ? dateET(s.processed_at) : '',
  ]));
  await addAudit('demo', null, OPS_ACTOR, 'Exported processed direct sales CSV', `${sales.length} sales · ${rows.length} line items`);
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ohlq-direct-wholesale-sales-processed.csv"`,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
    },
  });
}
