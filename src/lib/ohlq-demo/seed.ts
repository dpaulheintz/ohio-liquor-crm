// OHLQ Ops concept demo — seed data + "Reset demo". Dates are relative to the day of the reset so
// the Ops queues always tell the same story: 2 clean sales, 1 price mismatch, 1 processed; 2 pending
// tastings, 1 approved, 1 short notice, 1 time conflict. Other suppliers are fictional samples.
import { addAudit, db, getPriceBook, setSetting } from './server';
import {
  DEFAULT_SIN_TAX, OPS_ACTOR, PARTNER, SUPPLIER_ACTOR, addBusinessDays, addDays, todayET,
  type Signature,
} from './shared';

/** A deterministic, handwriting-like squiggle (sample signatures only). */
export function sampleSignature(seedText: string): Signature {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  const w = 320, ht = 100;
  const strokes: [number, number][][] = [];
  // first name: a tall capital loop then a running wave
  const main: [number, number][] = [];
  const loops = 5 + Math.floor(rnd() * 4);
  const amp = 14 + rnd() * 8;
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    const x = 22 + t * 250 + Math.cos(t * loops * Math.PI * 2) * 9;
    const cap = Math.exp(-((t - 0.04) ** 2) / 0.002) * 26;
    const y = 58 - Math.sin(t * loops * Math.PI * 2) * amp * (0.6 + 0.4 * Math.sin(t * 3)) - cap + t * 6;
    main.push([Math.round(x), Math.round(y)]);
  }
  strokes.push(main);
  // a crossing stroke and an underline flourish
  const cx = 70 + rnd() * 120;
  strokes.push([[Math.round(cx - 12), 40], [Math.round(cx + 16), 36]]);
  const under: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    under.push([Math.round(40 + t * 230), Math.round(84 - Math.sin(t * Math.PI) * 5 + t * 2)]);
  }
  strokes.push(under);
  return { w, h: ht, strokes };
}

const CUSTOMERS = [
  { name: 'Around the Clock Hospitality', dba: 'Clock Tower Kitchen & Bar', phone: '614-873-2970', address: '101 S Chillicothe St', city: 'Plain City', zip: '43064', county: 'Madison County', permit_number: '00257887-1' },
  { name: "JT's Grandview", dba: null, phone: '614-407-0088', address: '845 Goodale Blvd', city: 'Grandview Heights', zip: '43212', county: 'Franklin County', permit_number: '10006967-1' },
  { name: 'Brookside Country Club', dba: null, phone: '614-889-2581', address: '2770 W Dublin-Granville Rd', city: 'Columbus', zip: '43235', county: 'Franklin County', permit_number: '10000604-1-2' },
  { name: 'CMR LLC', dba: "Marcella's Polaris", phone: '614-844-6500', address: '1219 Polaris Pkwy', city: 'Columbus', zip: '43240', county: 'Delaware County', permit_number: '12046700030' },
  { name: 'CMR LLC', dba: "Marcella's Short North", phone: '614-223-2100', address: '615 N High St', city: 'Columbus', zip: '43215', county: 'Franklin County', permit_number: '12046700090' },
  { name: 'Riverbend Taproom (sample)', dba: 'Riverbend Taproom', phone: '216-555-0142', address: '1200 W 9th St', city: 'Cleveland', zip: '44113', county: 'Cuyahoga County', permit_number: '99900142-1' },
];

type SeedLine = { code: string; qty: number; priceOverride?: number };

const TABLES = ['ohlq_demo_audit', 'ohlq_demo_messages', 'ohlq_demo_wholesale_lines', 'ohlq_demo_wholesale_sales', 'ohlq_demo_tastings', 'ohlq_demo_customers', 'ohlq_demo_settings'] as const;

export async function resetDemo(): Promise<{ sales: number; tastings: number; customers: number }> {
  const supa = db();
  for (const t of TABLES) {
    const { error } = await supa.from(t).delete().not(t === 'ohlq_demo_settings' ? 'key' : 'id', 'is', null);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }

  const book = new Map((await getPriceBook()).map((p) => [p.code, p]));
  const today = todayET();
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`).toISOString();

  // ── Customers (the "permit file") ─────────────────────────────────────────
  const { data: custRows, error: custErr } = await supa.from('ohlq_demo_customers')
    .insert(CUSTOMERS.map((c) => ({ ...c, state: 'OH', is_f2: false, permit_verified: true })))
    .select('id, permit_number');
  if (custErr) throw custErr;
  const custId = new Map((custRows ?? []).map((c) => [c.permit_number as string, c.id as string]));

  // ── Wholesale submissions ─────────────────────────────────────────────────
  const sales: { ref: string; permit: string; date: string; status: 'submitted' | 'processed'; lines: SeedLine[]; submitted: string; processed?: string; signer: string; title?: string }[] = [
    { ref: 'WS-1001', permit: '10006967-1', date: addDays(today, -14), status: 'processed', lines: [{ code: '6928B', qty: 12 }, { code: '6933B', qty: 6 }], submitted: addDays(today, -13), processed: addDays(today, -11), signer: 'Taylor Brooks', title: 'General Manager' },
    { ref: 'WS-1002', permit: '00257887-1', date: addDays(today, -4), status: 'submitted', lines: [{ code: '6931B', qty: 6 }, { code: '6929B', qty: 12 }, { code: '7010B', qty: 6 }], submitted: addDays(today, -3), signer: 'Morgan Ellis', title: 'Bar Manager' },
    { ref: 'WS-1003', permit: '10000604-1-2', date: addDays(today, -3), status: 'submitted', lines: [{ code: '6935B', qty: 3 }, { code: '6627B', qty: 2 }], submitted: addDays(today, -2), signer: 'Casey Lindqvist', title: 'F&B Director' },
    // Price mismatch: billed last year's price on Double Double Oaked
    { ref: 'WS-1004', permit: '12046700030', date: addDays(today, -2), status: 'submitted', lines: [{ code: '4281B', qty: 3, priceOverride: 8900 }, { code: '6930B', qty: 12 }], submitted: addDays(today, -1), signer: 'Jordan Reyes', title: 'Owner' },
  ];

  for (const s of sales) {
    const c = CUSTOMERS.find((x) => x.permit_number === s.permit)!;
    const lines = s.lines.map((l, i) => {
      const p = book.get(l.code)!;
      const price = l.priceOverride ?? p.priceCents;
      return { brand_code: l.code, description: p.name, size_label: p.size, volume_l: p.volumeL, price_cents: price, quantity: l.qty, line_total_cents: price * l.qty, sort_order: i };
    });
    const subtotal = lines.reduce((t, l) => t + l.line_total_cents, 0);
    const a3aAt = at(s.date, '10:12');
    const custAt = at(s.date, '10:31');
    const { data: sale, error } = await supa.from('ohlq_demo_wholesale_sales').insert({
      ref_no: s.ref, supplier_name: PARTNER.name, status: s.status, customer_id: custId.get(s.permit),
      customer_name: c.name, customer_dba: c.dba, customer_phone: c.phone, customer_address: c.address,
      customer_city: c.city, customer_state: 'OH', customer_zip: c.zip, customer_county: c.county,
      is_f2: false, permit_number: c.permit_number, sales_date: s.date,
      subtotal_cents: subtotal, sin_tax_cents: 0, total_cents: subtotal,
      a3a_signature: sampleSignature(`a3a-${s.ref}`), a3a_signer_name: 'Paul Heintzman', a3a_signer_title: 'A-3a Permit Holder',
      a3a_signed_at: a3aAt, a3a_device: 'Mac · Chrome',
      customer_signature: sampleSignature(`cust-${s.ref}-${s.signer}`), customer_signer_name: `${s.signer}${s.title ? `, ${s.title}` : ''}`,
      customer_signed_at: custAt, customer_device: 'iPhone · Safari', customer_consent: true,
      sign_token: `seed${s.ref.replace('-', '')}${Math.random().toString(36).slice(2, 14)}xx`, sign_method: 'email', sign_sent_to: 'manager@example.com', sign_sent_at: at(s.date, '10:14'),
      submitted_at: at(s.submitted, '09:05'), processed_at: s.processed ? at(s.processed, '14:20') : null,
      created_at: at(s.date, '10:02'), updated_at: at(s.processed ?? s.submitted, '09:05'),
    }).select('id').single();
    if (error) throw error;
    const { error: lErr } = await supa.from('ohlq_demo_wholesale_lines').insert(lines.map((l) => ({ ...l, sale_id: sale.id })));
    if (lErr) throw lErr;
    const audit = [
      { actor: SUPPLIER_ACTOR, action: 'Created draft', at: at(s.date, '10:02') },
      { actor: SUPPLIER_ACTOR, action: 'A-3a signed', at: a3aAt },
      { actor: SUPPLIER_ACTOR, action: 'Sent for customer signature', detail: 'By email', at: at(s.date, '10:14') },
      { actor: `Customer: ${s.signer}`, action: 'Customer signed electronically', detail: 'iPhone · Safari', at: custAt },
      { actor: SUPPLIER_ACTOR, action: 'Submitted to OHLQ', at: at(s.submitted, '09:05') },
      ...(s.processed ? [{ actor: OPS_ACTOR, action: 'Processed', detail: 'Exported to OHLQ system — no retyping', at: at(s.processed, '14:20') }] : []),
    ];
    await supa.from('ohlq_demo_audit').insert(audit.map((a) => ({ entity_type: 'wholesale', entity_id: sale.id, actor: a.actor, action: a.action, detail: 'detail' in a ? a.detail : null, created_at: a.at })));
  }

  // ── Tasting applications ──────────────────────────────────────────────────
  const { data: ag } = await supa.from('accounts').select('agency_id, display_name, address, city, zip, county')
    .eq('type', 'agency').in('agency_id', ['30203', '30205', '30206', '40400']);
  const agency = new Map((ag ?? []).map((a) => [String(a.agency_id), a]));
  const prod = (code: string) => ({ code, name: book.get(code)?.name ?? code });
  const filedAgo = (n: number) => addDays(today, -n);
  const approvedDate = addBusinessDays(filedAgo(3), 12);
  const tastings = [
    { ref: 'TA-2001', supplier: PARTNER.name, agency: '30203', filed: filedAgo(2), date: addBusinessDays(filedAgo(2), 14), start: '16:00', end: '18:00', status: 'submitted', conductor: 'Riley Morgan', reg: 'S-31842', exp: addDays(today, 300), type: 'solicitor', products: ['6928B', '6929B'] },
    { ref: 'TA-2002', supplier: 'Buckeye Hollow Spirits (sample)', agency: '40400', filed: filedAgo(1), date: addBusinessDays(filedAgo(1), 12), start: '14:00', end: '16:00', status: 'submitted', conductor: 'Dana Whitfield', reg: 'S-27731', exp: addDays(today, 180), type: 'broker', products: [] },
    { ref: 'TA-2003', supplier: PARTNER.name, agency: '30205', filed: filedAgo(3), date: approvedDate, start: '17:00', end: '19:00', status: 'approved', conductor: 'Riley Morgan', reg: 'S-31842', exp: addDays(today, 300), type: 'trade_marketing', products: ['6933B', '6935B', '7010B'] },
    // Short notice: filed yesterday for 5 business days later
    { ref: 'TA-2004', supplier: PARTNER.name, agency: '30206', filed: filedAgo(1), date: addBusinessDays(filedAgo(1), 5), start: '15:00', end: '17:00', status: 'submitted', conductor: 'Riley Morgan', reg: 'S-31842', exp: addDays(today, 300), type: 'solicitor', products: ['6930B'] },
    // Time conflict with TA-2003 (same agency, 6–8 PM overlaps 5–7 PM)
    { ref: 'TA-2005', supplier: 'Lake Erie Craft Spirits (sample)', agency: '30205', filed: filedAgo(2), date: approvedDate, start: '18:00', end: '20:00', status: 'submitted', conductor: 'Sam Kowalski', reg: 'S-19055', exp: addDays(today, 90), type: 'solicitor', products: [] },
  ];
  for (const t of tastings) {
    const a = agency.get(t.agency);
    const hb = t.supplier === PARTNER.name;
    const otherProducts = t.ref === 'TA-2002' ? [{ code: 'S-118B', name: 'Hollow Creek Rye (sample)' }] : [{ code: 'S-204B', name: 'Lakeshore Gin (sample)' }];
    const { data: row, error } = await supa.from('ohlq_demo_tastings').insert({
      ref_no: t.ref, supplier_name: t.supplier, status: t.status,
      agency_id: t.agency, agency_name: a?.display_name ?? null, agency_address: a?.address ?? null, agency_city: a?.city ?? null,
      agency_zip: a?.zip ?? null, agency_county: a?.county ?? null,
      staff_granted: hb ? 'Store Manager (sample)' : 'Assistant Manager (sample)',
      event_date: t.date, start_time: t.start, end_time: t.end,
      conductor_name: t.conductor, solicitor_reg_no: t.reg, reg_expires: t.exp,
      applicant_type: t.type, training_confirmed: t.type === 'trade_marketing',
      products: hb ? t.products.map(prod) : otherProducts,
      employer: t.supplier, phone: hb ? PARTNER.phone : '614-555-0187', fax: null,
      email: hb ? PARTNER.email : 'tastings@example.com',
      applicant_signature: sampleSignature(`ta-${t.ref}`), applicant_signer_name: t.conductor, signed_at: at(t.filed, '11:40'),
      submitted_at: at(t.filed, '11:41'),
      decided_at: t.status === 'approved' ? at(addDays(t.filed, 1), '13:10') : null,
      decision_note: t.status === 'approved' ? 'Approved' : null,
      created_at: at(t.filed, '11:30'),
    }).select('id').single();
    if (error) throw error;
    const audit = [
      { actor: `${t.supplier} (applicant)`, action: 'Submitted application', at: at(t.filed, '11:41') },
      ...(t.status === 'approved' ? [{ actor: OPS_ACTOR, action: 'Approved', detail: 'Applicant notified by email', at: at(addDays(t.filed, 1), '13:10') }] : []),
    ];
    await supa.from('ohlq_demo_audit').insert(audit.map((x) => ({ entity_type: 'tasting', entity_id: row.id, actor: x.actor, action: x.action, detail: 'detail' in x ? x.detail : null, created_at: x.at })));
  }

  await setSetting('sin_tax', DEFAULT_SIN_TAX);
  await addAudit('demo', null, OPS_ACTOR, 'Demo reset to seed data');
  return { sales: sales.length, tastings: tastings.length, customers: CUSTOMERS.length };
}
