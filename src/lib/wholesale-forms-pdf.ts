import { PDFDocument, PDFFont, PDFPage, RGB, StandardFonts, rgb } from 'pdf-lib';
import {
  formatCents,
  formatSalesDate,
  recipientCityLine,
  splitAddress,
  type WholesaleForm,
  type WholesaleSettings,
} from '@/lib/wholesale-forms';

// Layout mirrors the Word template: US Letter, 0.7" margins, Arial-like type.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50.4;
const BOX_W = 435;
const COL_SPLIT = 197;

const hex = (h: string): RGB => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
const TITLE_BLUE = hex('1F4E79');
const RULE_BLUE = hex('5B9BD5');
const SHADE = hex('DEEAF6');
const LABEL_GRAY = hex('404040');
const BLACK = hex('000000');

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  serif: PDFFont;
}

class Writer {
  constructor(private page: PDFPage, private fonts: Fonts) {}

  /** Replace characters the standard (WinAnsi) fonts can't encode. */
  private safe(font: PDFFont, text: string): string {
    const supported = new Set(font.getCharacterSet());
    return Array.from(text).map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : '?')).join('');
  }

  private fit(font: PDFFont, text: string, size: number, maxWidth?: number): string {
    let t = this.safe(font, text);
    if (!maxWidth || font.widthOfTextAtSize(t, size) <= maxWidth) return t;
    while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  }

  width(text: string, size: number, font: PDFFont = this.fonts.regular): number {
    return font.widthOfTextAtSize(this.safe(font, text), size);
  }

  /** y is measured from the top of the page to the text baseline. */
  text(text: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: RGB; maxWidth?: number; align?: 'left' | 'right' | 'center'; shrink?: boolean } = {}) {
    const font = opts.font ?? this.fonts.regular;
    let size = opts.size ?? 9.5;
    // Shrink long values (down to 7.5pt) before resorting to an ellipsis.
    if (opts.shrink && opts.maxWidth) {
      const full = font.widthOfTextAtSize(this.safe(font, text), size);
      if (full > opts.maxWidth) size = Math.max(7.5, size * (opts.maxWidth / full));
    }
    const t = this.fit(font, text, size, opts.maxWidth);
    const w = font.widthOfTextAtSize(t, size);
    const dx = opts.align === 'right' ? -w : opts.align === 'center' ? -w / 2 : 0;
    this.page.drawText(t, { x: x + dx, y: PAGE_H - y, size, font, color: opts.color ?? BLACK });
  }

  rect(x: number, top: number, w: number, h: number, opts: { fill?: RGB; border?: RGB } = {}) {
    this.page.drawRectangle({
      x, y: PAGE_H - top - h, width: w, height: h,
      color: opts.fill, borderColor: opts.border, borderWidth: opts.border ? 0.9 : 0,
    });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB = BLACK, thickness = 0.7) {
    this.page.drawLine({ start: { x: x1, y: PAGE_H - y1 }, end: { x: x2, y: PAGE_H - y2 }, color, thickness });
  }
}

export async function renderWholesaleFormPdf(form: WholesaleForm, settings: WholesaleSettings): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Wholesale Sales Report ${formatSalesDate(form.sales_date)} - ${form.recipient_name ?? ''}`);
  doc.setAuthor(settings.a3a_name);
  doc.setCreator('High Bank CRM');

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
  };
  const w = new Writer(page, fonts);
  const L = MARGIN;
  const split = L + COL_SPLIT;
  const right = L + BOX_W;

  // ── Title + sales date ──────────────────────────────────────────────────────
  w.text(`WHOLESALE SALES REPORT **${settings.warehouse_label}** warehouse #${settings.agency_number}`, L, 66, { size: 14, font: fonts.bold, color: TITLE_BLUE });
  w.text('SALES DATE', L, 96, { size: 11, font: fonts.bold, color: TITLE_BLUE });
  w.text(formatSalesDate(form.sales_date), L + 78, 96, { size: 11 });

  // ── A-3a box ────────────────────────────────────────────────────────────────
  const box1Top = 108;
  const box1H = 86;
  w.rect(L, box1Top, BOX_W, box1H, { fill: SHADE, border: RULE_BLUE });
  w.line(split, box1Top, split, box1Top + box1H, RULE_BLUE, 0.9);

  const [street, cityLine] = splitAddress(settings.a3a_address);
  w.text('A-3a Name:', L + 6, box1Top + 20, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(settings.a3a_name, L + 68, box1Top + 20, { size: 11.5, font: fonts.serif, maxWidth: COL_SPLIT - 72, shrink: true });
  w.text('A-3a Address:', L + 6, box1Top + 50, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(street, L + 68, box1Top + 50, { size: 11.5, font: fonts.serif, maxWidth: COL_SPLIT - 72, shrink: true });
  w.text(cityLine, L + 68, box1Top + 68, { size: 11.5, font: fonts.serif, maxWidth: COL_SPLIT - 72, shrink: true });

  const rx = split + 8;
  const rMax = right - rx - 6;
  w.text(`A-3a Telephone Number: ${settings.a3a_phone}`, rx, box1Top + 30, { size: 8.5, font: fonts.bold, color: LABEL_GRAY, maxWidth: rMax });
  w.text(`A-3a Email Address: ${settings.a3a_email}`, rx, box1Top + 46, { size: 8.5, font: fonts.bold, color: LABEL_GRAY, maxWidth: rMax });
  w.text(`Agency #: ${settings.agency_number}`, rx, box1Top + 62, { size: 8.5, font: fonts.bold, color: LABEL_GRAY, maxWidth: rMax });

  // ── Recipient box ───────────────────────────────────────────────────────────
  const box2Top = box1Top + box1H;
  const box2H = 120;
  w.rect(L, box2Top, BOX_W, box2H, { border: RULE_BLUE });
  w.line(split, box2Top, split, box2Top + box2H, RULE_BLUE, 0.9);

  const vx = L + 68;
  const vMax = COL_SPLIT - 72;
  w.text('Recipient:', L + 6, box2Top + 18, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(form.recipient_name ?? '', vx, box2Top + 18, { size: 10.5, font: fonts.bold, maxWidth: vMax, shrink: true });
  w.text('Address', L + 6, box2Top + 44, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(form.recipient_address_line1 ?? '', vx, box2Top + 44, { size: 10, maxWidth: vMax, shrink: true });
  w.text(recipientCityLine(form), vx, box2Top + 58, { size: 10, maxWidth: vMax, shrink: true });
  w.text('Phone', L + 6, box2Top + 82, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(form.recipient_phone ?? '', vx, box2Top + 82, { size: 10, maxWidth: vMax, shrink: true });
  w.text('Customer ID#', L + 6, box2Top + 104, { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
  w.text(form.customer_id_number ?? '', vx, box2Top + 104, { size: 10, maxWidth: vMax, shrink: true });

  const isWholesale = (form.account_type ?? 'wholesale') === 'wholesale';
  w.text('Wholesale', rx + 22, box2Top + 22, { size: 12.5 });
  if (isWholesale) w.text('X', rx + 22 + w.width('Wholesale ', 12.5), box2Top + 22, { size: 12.5, font: fonts.bold });
  w.text('Transient', rx + 24, box2Top + 44, { size: 12.5 });
  if (!isWholesale) w.text('X', rx + 24 + w.width('Transient ', 12.5), box2Top + 44, { size: 12.5, font: fonts.bold });
  w.text('Please enter the wholesale or transient account number:', rx, box2Top + 68, { size: 7.8, maxWidth: rMax });
  w.text(form.account_number ?? '', rx + 2, box2Top + 92, { size: 11, font: fonts.bold, maxWidth: rMax, shrink: true });
  w.line(rx, box2Top + 96, rx + 168, box2Top + 96);

  // ── Product table ───────────────────────────────────────────────────────────
  const cols = [
    { label: ['Brand Code'], w: 52 },
    { label: ['Description'], w: 168 },
    { label: ['Unit Type'], w: 46 },
    { label: ['Order', 'Quantity'], w: 48 },
    { label: ['Price per', 'Bottle'], w: 60 },
    { label: ['Item Total'], w: 61 },
  ];
  const xs = cols.reduce<number[]>((acc, c, i) => [...acc, (acc[i] ?? L) + c.w], [L]);
  const tableTop = box2Top + box2H + 14;
  const headH = 28;
  const lines = [...form.lines].sort((a, b) => a.sort_order - b.sort_order);
  const signatureBlock = 92;
  const available = PAGE_H - MARGIN - signatureBlock - tableTop - headH;
  const rowH = Math.max(12, Math.min(19, available / Math.max(lines.length, 1)));
  const size = rowH >= 16 ? 9.5 : 8;

  w.rect(L, tableTop, BOX_W, headH, { fill: SHADE });
  cols.forEach((c, i) => {
    const multi = c.label.length > 1;
    c.label.forEach((part, j) => {
      w.text(part, xs[i] + 3, tableTop + (multi ? 11 + j * 10 : 18), { size: 8.5, font: fonts.bold, color: LABEL_GRAY });
    });
  });

  lines.forEach((ln, r) => {
    const top = tableTop + headH + r * rowH;
    const base = top + rowH / 2 + size / 2.8;
    w.text(ln.brand_code, xs[0] + 3, base, { size, maxWidth: cols[0].w - 5 });
    w.text(ln.description, xs[1] + 3, base, { size, maxWidth: cols[1].w - 5 });
    w.text(ln.unit_type, xs[2] + 3, base, { size, maxWidth: cols[2].w - 5 });
    if (ln.quantity > 0) {
      w.text(String(ln.quantity), xs[4] - 5, base, { size, font: fonts.bold, align: 'right' });
      w.text(formatCents(ln.line_total_cents), xs[6] - 4, base, { size, align: 'right' });
    }
    w.text(formatCents(ln.price_cents), xs[5] - 4, base, { size, align: 'right' });
  });

  const tableBottom = tableTop + headH + lines.length * rowH;
  for (let r = 0; r <= lines.length; r++) {
    const y = tableTop + headH + r * rowH;
    w.line(L, y, right, y, RULE_BLUE, 0.6);
  }
  w.line(L, tableTop, right, tableTop, RULE_BLUE, 0.9);
  xs.forEach((x) => w.line(x, tableTop, x, tableBottom, RULE_BLUE, 0.6));

  // ── Receipt total + signatures ──────────────────────────────────────────────
  const totalY = tableBottom + 30;
  w.text('Receipt Total:', L, totalY, { size: 11, font: fonts.bold });
  const totalX = L + w.width('Receipt Total: ', 11, fonts.bold) + 4;
  w.text(formatCents(form.receipt_total_cents), totalX + 4, totalY, { size: 11.5, font: fonts.bold });
  w.line(totalX, totalY + 3, totalX + 110, totalY + 3);
  w.text(`${form.total_bottles} bottles`, totalX + 120, totalY, { size: 8.5, color: LABEL_GRAY });

  const sigY = totalY + 40;
  w.text('Completed by:', L, sigY, { size: 9.5, font: fonts.bold });
  const c1 = L + w.width('Completed by: ', 9.5, fonts.bold);
  w.line(c1, sigY + 2, c1 + 130, sigY + 2);
  const rcvX = c1 + 150;
  w.text('Received by:', rcvX, sigY, { size: 9.5, font: fonts.bold });
  const c2 = rcvX + w.width('Received by: ', 9.5, fonts.bold);
  w.line(c2, sigY + 2, right, sigY + 2);
  w.text('A-3a Signature', c1 + 65, sigY + 14, { size: 8, color: LABEL_GRAY, align: 'center' });
  w.text('Customer Signature', (c2 + right) / 2, sigY + 14, { size: 8, color: LABEL_GRAY, align: 'center' });

  return doc.save();
}
