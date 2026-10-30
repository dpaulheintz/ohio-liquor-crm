import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatSalesDate } from '@/lib/wholesale-forms';
import { Writer, type Fonts } from '@/lib/wholesale-forms-pdf';
import type { RetailReqProduct, RetailRequisition } from '@/lib/retail-requisitions';

// One-page US Letter, laid out like the paper sheet.
const PAGE_W = 612;
const PAGE_H = 792;
const L = 54;
const R = PAGE_W - 54;
const SKU_W = 80;
const ITEMS_W = 70;
const TABLE_TOP = 122;
const TABLE_BOTTOM = 732;
const SHADE = rgb(0.9, 0.9, 0.9);
const BLACK = rgb(0, 0, 0);

export async function renderRetailRequisitionPdf(req: RetailRequisition, products: RetailReqProduct[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`HBD Retail Requisition ${req.location} ${req.purpose} ${formatSalesDate(req.req_date)}`);
  doc.setAuthor('High Bank Distillery');
  doc.setCreator('High Bank CRM');

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
  };
  const w = new Writer(page, fonts);

  // Purpose, big, where it's handwritten at the top of the paper sheet.
  w.text(req.purpose.toUpperCase(), L, 56, { size: 34, font: fonts.bold });

  // Date box, top right.
  const boxW = 118;
  w.rect(R - boxW, 28, boxW, 40, { border: BLACK });
  w.text('Date', R - boxW + 6, 39, { size: 8, font: fonts.bold });
  w.text(formatSalesDate(req.req_date), R - boxW / 2, 59, { size: 13, font: fonts.bold, align: 'center' });

  w.text('HBD Retail Requisition', PAGE_W / 2, 88, { size: 18, font: fonts.bold, align: 'center' });
  w.text(`****${req.location.toUpperCase()}****`, PAGE_W / 2, 108, { size: 13, font: fonts.bold, align: 'center' });

  // Every active SKU (blank where qty = 0), then anything else on this requisition (custom lines).
  const bySku = new Map(req.lines.map((l) => [l.sku, l]));
  const rows = products.map((p) => {
    const line = bySku.get(p.sku);
    return { sku: p.sku, description: line?.description ?? p.description, quantity: line?.quantity ?? null };
  });
  const listed = new Set(products.map((p) => p.sku));
  for (const l of req.lines) {
    if (!listed.has(l.sku)) rows.push({ sku: l.sku, description: l.description, quantity: l.quantity });
  }

  // Shrinks to stay on one page if the list grows; 28 SKUs print at the full row height.
  const rowH = Math.min(21, (TABLE_BOTTOM - TABLE_TOP) / (rows.length + 1));
  const size = Math.min(10.5, rowH * 0.58);
  const baseline = rowH / 2 + size * 0.35;
  const skuX = L + SKU_W;
  const itemsX = R - ITEMS_W;
  const tableH = rowH * (rows.length + 1);

  w.rect(L, TABLE_TOP, R - L, rowH, { fill: SHADE });
  w.text('SKU', L + 6, TABLE_TOP + baseline, { size, font: fonts.bold });
  w.text('Description', skuX + 6, TABLE_TOP + baseline, { size, font: fonts.bold });
  w.text('# Items', R - ITEMS_W / 2, TABLE_TOP + baseline, { size, font: fonts.bold, align: 'center' });

  rows.forEach((row, i) => {
    const top = TABLE_TOP + rowH * (i + 1);
    w.text(row.sku, L + 6, top + baseline, { size });
    w.text(row.description, skuX + 6, top + baseline, { size, maxWidth: itemsX - skuX - 12 });
    if (row.quantity) w.text(String(row.quantity), R - ITEMS_W / 2, top + baseline, { size: size + 0.5, font: fonts.bold, align: 'center' });
  });

  for (let i = 0; i <= rows.length + 1; i++) w.line(L, TABLE_TOP + rowH * i, R, TABLE_TOP + rowH * i);
  for (const x of [L, skuX, itemsX, R]) w.line(x, TABLE_TOP, x, TABLE_TOP + tableH);

  const footer = TABLE_TOP + tableH + 22;
  w.text(`Total items: ${req.total_items}`, L, footer, { size: 11, font: fonts.bold });
  w.text(`Requested by: ${req.requested_by_name ?? '—'}`, R, footer, { size: 11, align: 'right', maxWidth: 300 });

  return doc.save();
}
