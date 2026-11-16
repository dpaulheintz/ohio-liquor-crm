// OHLQ Ops concept demo — PDFs laid out like the paper forms:
//   • A-3a Direct Sale to Wholesale Customer (OHLQ's fillable Wholesale Sales Report)
//   • LIQ-19-0004 Application to Conduct a Spirituous Liquor Tasting at a Contract Liquor Agency
// Coordinates are measured on the originals rendered at 952×1232 px and scaled to US Letter (P()).
// Every page carries a "concept demo" footer so a demo PDF can't pass for a real filing.
import { LineCapStyle, PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb, type RGB } from 'pdf-lib';
import { OHLQ_LOGO_WHITE_PNG_BASE64 } from './logo-white';
import {
  APPLICANT_TYPES, ORC_4301_253_ITEMS, PARTNER, fmtCents, fmtDate, fmtDateTime, fmtTime,
  type Sale, type Signature, type Tasting,
} from './shared';

const W = 612, H = 792;
const P = (px: number) => px * (612 / 952);
const BLACK = rgb(0, 0, 0);
const RED = rgb(0.784, 0.063, 0.18); // header band on the A-3a form
const BOX_RED = rgb(0.87, 0.2, 0.2);
const HEAD_BLUE = rgb(0.8, 0.92, 0.97);
const NAVY = rgb(0.11, 0.23, 0.42);
const GRAY = rgb(0.38, 0.38, 0.38);
const INK = rgb(0.08, 0.15, 0.45);

interface Fonts { reg: PDFFont; bold: PDFFont; ital: PDFFont; serif: PDFFont; serifBold: PDFFont }

class Pen {
  constructor(private page: PDFPage, private f: Fonts) {}
  private safe(font: PDFFont, s: string) {
    const ok = new Set(font.getCharacterSet());
    return Array.from(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-'))
      .map((c) => (ok.has(c.codePointAt(0)!) ? c : '?')).join('');
  }
  width(s: string, size: number, font = this.f.reg) { return font.widthOfTextAtSize(this.safe(font, s), size); }
  /** x, y in image px; y = baseline from the top. */
  text(s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: RGB; max?: number; align?: 'left' | 'center' | 'right' } = {}) {
    const font = o.font ?? this.f.reg;
    let size = o.size ?? 9;
    let t = this.safe(font, s ?? '');
    if (o.max) {
      const maxPt = P(o.max);
      const full = font.widthOfTextAtSize(t, size);
      if (full > maxPt) size = Math.max(6, size * (maxPt / full));
      while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxPt) t = t.slice(0, -1);
    }
    const w = font.widthOfTextAtSize(t, size);
    const dx = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
    this.page.drawText(t, { x: P(x) + dx, y: H - P(y), size, font, color: o.color ?? BLACK });
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; border?: RGB; bw?: number } = {}) {
    this.page.drawRectangle({ x: P(x), y: H - P(y + h), width: P(w), height: P(h), color: o.fill, borderColor: o.border, borderWidth: o.border ? (o.bw ?? 0.8) : 0 });
  }
  line(x1: number, y1: number, x2: number, y2: number, o: { color?: RGB; t?: number } = {}) {
    this.page.drawLine({ start: { x: P(x1), y: H - P(y1) }, end: { x: P(x2), y: H - P(y2) }, color: o.color ?? BLACK, thickness: o.t ?? 0.7 });
  }
  checkbox(x: number, y: number, checked: boolean) {
    this.rect(x, y, 10, 10, { border: BLACK, bw: 0.6 });
    if (checked) {
      this.line(x + 1.5, y + 5.5, x + 4, y + 8.5, { t: 1.1 });
      this.line(x + 4, y + 8.5, x + 9, y + 1.5, { t: 1.1 });
    }
  }
  /** Draw a vector signature fitted into the box (image px), bottom-left aligned. */
  signature(sig: Signature | null, x: number, y: number, w: number, h: number) {
    if (!sig) return;
    const pts = sig.strokes.flat();
    if (!pts.length) return;
    const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
    const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    const s = Math.min(P(w) / bw, P(h) / bh);
    const path = sig.strokes.map((st) => st.map(([px, py], i) => `${i ? 'L' : 'M'}${((px - minX) * s).toFixed(2)} ${((py - minY) * s).toFixed(2)}`).join(' ')
      + (st.length === 1 ? ' l0.3 0.3' : '')).join(' ');
    this.page.drawSvgPath(path, {
      x: P(x), y: H - P(y + h) + bh * s, borderColor: INK, borderWidth: Math.max(0.7, Math.min(1.4, s * 2.2)),
      borderLineCap: LineCapStyle.Round,
    });
  }
  vtext(s: string, cx: number, bottomY: number, size: number) {
    this.page.drawText(s, { x: P(cx) + size / 2.8, y: H - P(bottomY), size, font: this.f.reg, rotate: degrees(90), color: BLACK });
  }
}

async function fontsFor(doc: PDFDocument): Promise<Fonts> {
  return {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
}

function demoFooter(pen: Pen, f: Fonts, ref: string) {
  pen.text(`Concept demo prepared by High Bank Distillery · Not an official OHLQ record · Sample data · ${ref}`, 476, 1222, { size: 6.5, font: f.ital, color: GRAY, align: 'center' });
}

// ─── A-3a Direct Sale to Wholesale Customer ───────────────────────────────────

export async function renderA3aPdf(sale: Sale): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`A-3a Direct Sale to Wholesale Customer ${sale.ref_no}`);
  doc.setAuthor(PARTNER.name);
  doc.setCreator('OHLQ Ops concept demo (High Bank Distillery)');
  const page = doc.addPage([W, H]);
  const f = await fontsFor(doc);
  const pen = new Pen(page, f);

  // Red band + white logo
  pen.rect(0, 0, 952, 88, { fill: RED });
  const logo = await doc.embedPng(Buffer.from(OHLQ_LOGO_WHITE_PNG_BASE64, 'base64'));
  const lh = P(40), lw = lh * (logo.width / logo.height);
  page.drawImage(logo, { x: P(20), y: H - P(24) - lh, width: lw, height: lh });

  pen.text('A-3a Direct Sale to Wholesale Customer', 476, 122, { size: 15, font: f.bold, align: 'center' });

  // ── A-3a Information box
  pen.rect(50, 145, 814, 147, { border: BOX_RED, bw: 1 });
  pen.rect(57, 151, 47, 135, { border: BOX_RED, bw: 1 });
  pen.vtext('A-3a Information', 80, 276, 9);
  const v = { size: 10.5, font: f.serif };
  pen.text('Name', 140, 186);                 pen.text(PARTNER.name, 200, 186, { ...v, max: 330 });
  pen.text('Address', 126, 224);              pen.text(PARTNER.address, 200, 224, { ...v, max: 330 });
  pen.text('City', 153, 262);                 pen.text(PARTNER.city, 200, 262, { ...v, max: 140 });
  pen.text('State', 354, 262);                pen.text('OH', 390, 262, { size: 11 });
  pen.text('Postal', 429, 262);               pen.text(PARTNER.zip, 472, 262, { ...v });
  pen.text('Phone', 559, 187, { font: f.bold }); pen.text(PARTNER.phone, 615, 187, { ...v, max: 235 });
  pen.text('Email', 559, 224, { font: f.bold }); pen.text(PARTNER.email, 615, 224, { ...v, max: 240 });
  pen.text(`Vendor # ${PARTNER.vendorNumber}`, 559, 262, { size: 8.5, color: GRAY });

  // ── Wholesale Customer Information box
  pen.rect(52, 322, 810, 264, { border: BOX_RED, bw: 1 });
  pen.rect(59, 328, 43, 252, { border: BOX_RED, bw: 1 });
  pen.vtext('Wholesale Customer Information', 80, 568, 9);
  const lab = { font: f.bold };
  pen.text('Customer Name', 126, 359, lab);    pen.text(sale.customer_name ?? '', 126, 381, { ...v, max: 410 });
  pen.text('Customer DBA', 127, 421, lab);     pen.text(sale.customer_dba ?? '', 127, 443, { ...v, max: 410 });
  pen.text('Customer Address', 126, 485, lab); pen.text(sale.customer_address ?? '', 126, 507, { ...v, max: 410 });
  pen.text(sale.customer_city ?? '', 126, 529, { ...v, max: 220 });
  pen.text('State', 358, 553);                 pen.text('OH', 394, 553, { size: 11 });
  pen.text('Postal', 433, 553);                pen.text(sale.customer_zip ?? '', 474, 553, { ...v });
  pen.text('Is this an F2 Permit?', 564, 359, lab);
  pen.text(sale.is_f2 ? 'Yes' : 'No', 564, 381, { ...v });
  pen.text('Customer Phone:', 561, 421, lab);  pen.text(sale.customer_phone ?? '', 561, 443, { ...v, max: 290 });
  pen.text('Permit Number', 569, 486);         pen.text(sale.permit_number ?? '', 569, 508, { ...v, font: f.serifBold, max: 280 });

  pen.text('Sales Date:', 116, 615, lab);
  pen.text(fmtDate(sale.sales_date, { month: '2-digit', day: '2-digit', year: 'numeric' }), 196, 615, { ...v });

  // ── Line items (7 rows like the form; more rows shrink to fit)
  const cols = [112, 225, 362, 524, 721, 847];
  const heads = ['Brand Code', 'Product Name', 'Quantity (Bottles)', 'Price Per Bottle', 'Item Subtotal'];
  const top = 654, headH = 22;
  const n = Math.max(7, sale.lines.length);
  const rowH = n <= 7 ? 31 : Math.max(17, (893 - 676 + 31 * 2) / n);
  pen.rect(cols[0], top, cols[5] - cols[0], headH, { fill: HEAD_BLUE });
  heads.forEach((h, i) => pen.text(h, (cols[i] + cols[i + 1]) / 2, top + 15, { size: 8.5, font: f.bold, align: 'center' }));
  const tableBottom = top + headH + n * rowH;
  for (let r = 0; r <= n; r++) pen.line(cols[0], top + headH + r * rowH, cols[5], top + headH + r * rowH, { t: 0.6 });
  pen.line(cols[0], top, cols[5], top, { t: 0.6 });
  cols.forEach((x) => pen.line(x, top, x, tableBottom, { t: 0.6 }));
  const fs = rowH >= 25 ? 9 : 7.5;
  for (let r = 0; r < n; r++) {
    const base = top + headH + r * rowH + rowH / 2 + 4;
    const l = sale.lines[r];
    if (!l) { pen.text('$ 0.00', cols[4] + 36, base, { size: 10, color: GRAY }); continue; }
    pen.text(l.brand_code, cols[0] + 6, base, { size: fs + 0.5, font: f.bold });
    const desc = `${l.description}${l.size_label ? ` ${l.size_label}` : ''}`;
    const cellW = cols[2] - cols[1] - 10;
    if (pen.width(desc, fs) <= P(cellW)) pen.text(desc, cols[1] + 5, base, { size: fs });
    else {
      // wrap into two lines (the column on the official form is narrow)
      const words = desc.split(' ');
      let a = '';
      while (words.length && pen.width(`${a} ${words[0]}`.trim(), fs - 1) <= P(cellW)) a = `${a} ${words.shift()}`.trim();
      const two = rowH >= 25;
      pen.text(a, cols[1] + 5, two ? base - 5 : base, { size: fs - 1, max: cellW });
      if (two) pen.text(words.join(' '), cols[1] + 5, base + 6, { size: fs - 1, max: cellW });
    }
    pen.text(String(l.quantity), (cols[2] + cols[3]) / 2, base, { size: fs + 1, align: 'center' });
    pen.text(fmtCents(l.price_cents), cols[4] - 10, base, { size: fs + 1, align: 'right' });
    pen.text(fmtCents(l.line_total_cents), cols[5] - 10, base, { size: fs + 1, align: 'right' });
  }
  // SIN tax + invoice total
  const sinTop = tableBottom;
  pen.rect(524, sinTop, 323, 32, { border: BLACK, bw: 0.6 });
  pen.line(721, sinTop, 721, sinTop + 64, { t: 0.6 });
  pen.text('SIN tax, if applicable:', 627, sinTop + 21, { size: 9.5, align: 'center' });
  if (sale.sin_tax_cents) pen.text(fmtCents(sale.sin_tax_cents), 837, sinTop + 21, { size: 10, align: 'right' });
  pen.rect(524, sinTop + 32, 323, 32, { border: BLACK, bw: 0.6 });
  pen.text('Invoice Total', 622, sinTop + 55, { size: 13, font: f.bold, align: 'center' });
  pen.text(fmtCents(sale.total_cents), 837, sinTop + 55, { size: 11, font: f.bold, align: 'right' });
  if (sale.sin_tax_cents && sale.sin_tax_note) pen.text(sale.sin_tax_note, 112, sinTop + 21, { size: 7, color: GRAY, max: 400 });

  // ── Signatures
  const sigY = Math.max(1017, sinTop + 110);
  pen.text('A-3a  Signature:', 148, sigY, lab);
  pen.line(272, sigY + 3, 640, sigY + 3, { t: 0.5, color: GRAY });
  pen.signature(sale.a3a_signature, 285, sigY - 42, 240, 44);
  if (sale.a3a_signed_at) {
    pen.text(`${sale.a3a_signer_name ?? ''}${sale.a3a_signer_title ? `, ${sale.a3a_signer_title}` : ''}`, 650, sigY - 8, { size: 8.5, max: 250 });
    pen.text(`Signed electronically ${fmtDateTime(sale.a3a_signed_at)}`, 650, sigY + 4, { size: 6.8, color: GRAY, max: 250 });
  }
  const cY = sigY + 63;
  pen.text('Customer Signature:', 106, cY, lab);
  pen.line(272, cY + 3, 640, cY + 3, { t: 0.5, color: GRAY });
  pen.signature(sale.customer_signature, 285, cY - 42, 240, 44);
  if (sale.customer_signed_at) {
    pen.text(sale.customer_signer_name ?? '', 650, cY - 8, { size: 8.5, max: 250 });
    pen.text(`Signed electronically ${fmtDateTime(sale.customer_signed_at)}`, 650, cY + 4, { size: 6.8, color: GRAY, max: 250 });
    pen.text(`${sale.customer_device ?? ''} · agreed to sign electronically`, 650, cY + 14, { size: 6.8, color: GRAY, max: 250 });
  }
  pen.text(`Submitted via OHLQ partner portal (concept) · ${sale.ref_no}${sale.submitted_at ? ` · submitted ${fmtDateTime(sale.submitted_at)}` : ''}`, 476, 1190, { size: 7.5, color: GRAY, align: 'center' });
  demoFooter(pen, f, sale.ref_no);
  return doc.save();
}

// ─── LIQ-19-0004 tasting application ──────────────────────────────────────────

export async function renderTastingPdf(t: Tasting): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`LIQ-19-0004 Tasting Application ${t.ref_no}`);
  doc.setAuthor(t.supplier_name);
  doc.setCreator('OHLQ Ops concept demo (High Bank Distillery)');
  const page = doc.addPage([W, H]);
  const f = await fontsFor(doc);
  const pen = new Pen(page, f);
  const val = { size: 10.5, font: f.reg };

  // Header (text only — no state logo)
  pen.text('Department of', 155, 52, { size: 15, font: f.bold, color: NAVY });
  pen.text('Commerce', 155, 77, { size: 15, font: f.bold, color: NAVY });
  pen.line(155, 88, 330, 88, { color: NAVY, t: 0.6 });
  pen.text('Division of Liquor Control', 155, 105, { size: 8, font: f.bold, color: NAVY });
  pen.text('Application to Conduct a Spirituous Liquor Tasting at a', 463, 150, { size: 14, font: f.bold, align: 'center' });
  pen.text('Contract Liquor Agency', 463, 179, { size: 14, font: f.bold, align: 'center' });
  pen.text('This application must be filed no less than 10 business days prior to the event.', 463, 215, { size: 9, font: f.ital, align: 'center' });
  pen.text(`Filed electronically through the OHLQ partner portal (concept) · ${t.ref_no} · filed ${fmtDateTime(t.submitted_at)}`, 463, 233, { size: 7.5, font: f.ital, color: GRAY, align: 'center' });

  const L = 20, R = 905;
  pen.rect(L, 257, R - L, 18, { fill: BLACK });
  pen.text('Tasting Event Information:', L + 4, 271, { size: 9, font: f.bold, color: rgb(1, 1, 1) });
  pen.rect(L, 257, R - L, 648, { border: BLACK, bw: 0.9 });
  const small = { size: 6.8 };

  // Agency number / name
  pen.line(L, 311, R, 311); pen.line(237, 275, 237, 311);
  pen.text('Agency Number:', L + 3, 283, small); pen.text(t.agency_id, 128, 302, { size: 12, font: f.bold, align: 'center' });
  pen.text('Agency Name:', 240, 283, small);     pen.text(t.agency_name ?? '', 571, 302, { size: 12, font: f.bold, align: 'center', max: 560 });
  // Address / city / state / zip
  pen.line(L, 349, R, 349); [402, 660, 752].forEach((x) => pen.line(x, 311, x, 349));
  pen.text('Agency Address:', L + 3, 320, small); pen.text(t.agency_address ?? '', 152, 343, { ...val, max: 245 });
  pen.text('City:', 405, 320, small);              pen.text(t.agency_city ?? '', 531, 343, { ...val, align: 'center', max: 250 });
  pen.text('State:', 663, 320, small);             pen.text('OH', 706, 343, { ...val, font: f.bold, align: 'center' });
  pen.text('ZIP:', 755, 320, small);               pen.text(t.agency_zip ?? '', 828, 343, { ...val, align: 'center' });

  // Staff + dates/times (the paper form labels both times "Time Event Begins" — fixed here)
  pen.text('Name of Agency Staff who granted permission to hold Tasting:', 49, 373, { size: 8 });
  pen.text(t.staff_granted ?? '', 407, 373, { size: 10, font: f.bold, max: 440 }); pen.line(405, 380, 850, 380);
  const d = fmtDate(t.event_date, { month: 'numeric', day: 'numeric', year: 'numeric' });
  pen.text('Date Event Begins:', 33, 405, { size: 8 }); pen.text(d, 150, 405, val); pen.line(148, 412, 397, 412);
  pen.text('Time Event Begins (no more than two hours):', 407, 405, { size: 8 }); pen.text(fmtTime(t.start_time), 663, 405, val); pen.line(660, 412, 850, 412);
  pen.text('Date Event Ends:', 33, 436, { size: 8 }); pen.text(d, 150, 436, val); pen.line(148, 443, 397, 443);
  pen.text('Time Event Ends (no more than two hours):', 407, 436, { size: 8 }); pen.text(fmtTime(t.end_time), 663, 436, val); pen.line(660, 443, 850, 443);

  // Conductor + registration
  pen.line(L, 452, R, 452); pen.line(L, 490, R, 490); pen.line(573, 452, 573, 490);
  pen.text('Name of individual conducting', L + 3, 464, small); pen.text('the tasting event:', L + 3, 483, small);
  pen.text(t.conductor_name ?? '', 150, 480, { ...val, max: 415 });
  pen.text('Solicitor Registration', 577, 464, small); pen.text('Number:', 577, 483, small);
  pen.text(`${t.solicitor_reg_no ?? ''}${t.reg_expires ? ` - exp ${fmtDate(t.reg_expires, { month: 'numeric', day: 'numeric', year: '2-digit' })}` : ''}`, 805, 478, { ...val, align: 'center', max: 190 });

  // Applicant type + ORC 4301.253
  pen.text('Applicant is a:', 33, 513, { size: 8 });
  const types = [
    { key: 'solicitor', y: 508, label: 'Solicitor' },
    { key: 'broker', y: 524, label: 'Broker' },
    { key: 'trade_marketing', y: 540, label: 'Trade marketing professional and has successfully completed a training program described in Ohio Revised Code' },
  ];
  types.forEach((ty) => {
    pen.checkbox(120, ty.y - 1, t.applicant_type === ty.key);
    pen.text(ty.label, 150, ty.y + 8, { size: 8 });
  });
  pen.text('Section 4301.253 (see below).', 150, 564, { size: 8 });
  if (t.applicant_type === 'trade_marketing') pen.text(t.training_confirmed ? 'Training confirmed by applicant' : 'Training NOT confirmed', 650, 564, { size: 7.5, font: f.ital, color: t.training_confirmed ? GRAY : RED });
  pen.text('ORC  4301.253  Training program :', 150, 597, { size: 8, font: f.bold });
  pen.line(150, 599, 330, 599, { t: 0.4 });
  pen.text('A training program that includes the following:', 150, 614, { size: 8 });
  const orcY = [633, 652, 685, 706];
  ORC_4301_253_ITEMS.forEach((item, i) => {
    if (i === 1) {
      pen.text('(B) Instruction on the prevention of the illegal serving of beer, wine, mixed beverages, and intoxicating liquor to persons under', 150, orcY[i], { size: 8 });
      pen.text('twenty-one years of age;', 173, orcY[i] + 15, { size: 8 });
    } else pen.text(item, 150, orcY[i], { size: 8 });
  });

  // Products
  pen.line(L, 733, R, 733);
  pen.text('Indicate below or attach a list of the types(s) and brand(s) of spirituous liquor to be sampled at the Agency:', L + 3, 742, small);
  const per = 3;
  t.products.slice(0, 9).forEach((p, i) => {
    const col = Math.floor(i / per), row = i % per;
    const x = 30 + col * 290, y = 757 + row * 13;
    pen.text(p.code, x + 62, y, { size: 7.5, align: 'right' });
    pen.text(p.name.toUpperCase(), x + 66, y, { size: 7.5, max: 215 });
  });
  if (t.products.length > 9) pen.text(`+ ${t.products.length - 9} more (see portal)`, 890, 791, { size: 7, color: GRAY, align: 'right' });

  // Employer / signature / phone / fax / email
  pen.line(L, 795, R, 795);
  pen.text('Name of Employer:', L + 3, 804, small); pen.text((t.employer ?? '').toUpperCase(), 150, 827, { ...val, max: 740 });
  pen.line(L, 833, R, 833); pen.line(575, 833, 575, 868);
  pen.text('Signature of Applicant:', L + 3, 842, small);
  pen.signature(t.applicant_signature, 150, 836, 150, 28);
  pen.text(t.applicant_signer_name ?? '', 315, 862, { ...val, max: 250 });
  pen.text('Phone Number:', 579, 842, small); pen.text(t.phone ?? '', 740, 862, { ...val, align: 'center' });
  pen.line(L, 868, R, 868); pen.line(490, 868, 490, 905);
  pen.text('Fax Number:', L + 3, 877, small); pen.text(t.fax ?? '', 150, 899, val);
  pen.text('Email Address:', 493, 877, small); pen.text(t.email ?? '', 577, 899, { ...val, color: rgb(0.1, 0.3, 0.8), max: 320 });

  // For Division Use Only — filled from the Ops decision
  pen.rect(L, 925, R - L, 96, { border: BLACK, bw: 0.9 });
  pen.text('For Division Use Only:', 463, 942, { size: 10, font: f.bold, align: 'center' });
  pen.text('Tasting is:', 30, 972, { size: 8 });
  pen.checkbox(154, 963, t.status === 'approved'); pen.text('Approved', 185, 972, { size: 8 });
  pen.checkbox(255, 963, t.status === 'rejected'); pen.text('Rejected', 286, 972, { size: 8 });
  if (t.status === 'rejected' && t.decision_note) pen.text(`Reason: ${t.decision_note}`, 360, 972, { size: 7.5, max: 530 });
  pen.text('Signature:', 30, 1004, { size: 8 }); pen.line(148, 1010, 575, 1010, { t: 0.9 });
  pen.text('Date:', 607, 1004, { size: 8 }); pen.line(660, 1010, 850, 1010, { t: 0.9 });
  if (t.decided_at) {
    pen.text('OHLQ Agency Operations (demo reviewer) - decided electronically', 152, 1004, { size: 9, font: f.ital });
    pen.text(fmtDate(t.decided_at.slice(0, 10), { month: 'numeric', day: 'numeric', year: 'numeric' }), 664, 1004, { size: 10 });
  }

  // Footer block as on the form
  const foot = { size: 8.5 };
  ['Agency Operations', '6606 Tussing Road', 'Reynoldsburg, OH  43068-9009', 'LIQ-19-0004', 'March 19, 2019'].forEach((s, i) => pen.text(s, 47, 1057 + i * 20, foot));
  ['LESC 877-813-0013', 'Fax 614-728-1281', 'TTY/TDD 800-750-0750', 'com.ohio.gov'].forEach((s, i) => pen.text(s, 848, 1057 + i * 20, { ...foot, align: 'right' }));
  pen.text(`Applicant type: ${APPLICANT_TYPES.find((a) => a.value === t.applicant_type)?.label ?? ''} · Supplier: ${t.supplier_name}`, 463, 1180, { size: 7, color: GRAY, align: 'center' });
  demoFooter(pen, f, t.ref_no);
  return doc.save();
}
