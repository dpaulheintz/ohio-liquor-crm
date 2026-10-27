import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';
import { getPayrollAccess, loadConfig, loadRun, loadRunDetail, log, toPayLine } from '@/lib/payroll/server';
import { summarize } from '@/lib/payroll/engine';
import { centsDisplay, hoursPlain } from '@/lib/payroll/units';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One-page-per-section run summary for our records. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = await createClient();
  const access = await getPayrollAccess(supabase);
  if (!access.userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const run = await loadRun(supabase, id);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [config, detail] = await Promise.all([loadConfig(supabase), loadRunDetail(supabase, id)]);
  const lines = detail.lines.map(toPayLine);
  const summaries = summarize(lines, []);
  const locName = (lid: string | null) => config.locations.find((l) => l.id === lid)?.name ?? 'Unassigned';

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: string) => { const ok = new Set(font.getCharacterSet()); return Array.from(s).map((c) => (ok.has(c.codePointAt(0)!) ? c : '?')).join(''); };
  let page = doc.addPage([612, 792]);
  let y = 742;
  const text = (s: string, x: number, size = 9.5, f = font, color = rgb(0, 0, 0)) => page.drawText(safe(s), { x, y, size, font: f, color });
  const nl = (h = 14) => { y -= h; if (y < 60) { page = doc.addPage([612, 792]); y = 742; } };
  const wrap = (s: string, width: number) => s.match(new RegExp(`.{1,${width}}(?:\\s|$)|.{${width}}`, 'g'))?.map((p) => p.trim()) ?? [s];
  const right = (s: string, xr: number, size = 9.5, f = font) => page.drawText(safe(s), { x: xr - f.widthOfTextAtSize(safe(s), size), y, size, font: f });

  text('Payroll Run Summary', 50, 16, bold, rgb(0.12, 0.31, 0.47)); nl(22);
  text(`Pay period ${run.period_start} to ${run.period_end}  ·  Status: ${run.status}`, 50); nl();
  text(`Approved: ${run.approved_at ? `${new Date(run.approved_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} by ${run.approved_by_name ?? '—'}` : 'not approved'}`, 50); nl();
  if (run.exported_at) { text(`Exported: ${new Date(run.exported_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} by ${run.exported_by_name ?? '—'}`, 50); nl(); }
  nl(8);

  const cols = [50, 200, 260, 330, 400, 470, 560];
  text('Location', cols[0], 9, bold); right('Employees', cols[2], 9, bold); right('REG hrs', cols[3], 9, bold); right('OT hrs', cols[4], 9, bold);
  right('Tips', cols[5], 9, bold); right('Est. gross', cols[6], 9, bold); nl();
  const tot = { emp: 0, reg: 0, ot: 0, tips: 0, gross: 0 };
  for (const s of summaries) {
    text(locName(s.locationId), cols[0]); right(String(s.employees), cols[2]); right(hoursPlain(s.regHh), cols[3]); right(hoursPlain(s.otHh), cols[4]);
    right(centsDisplay(s.tipsCents + s.gratCents), cols[5]); right(centsDisplay(s.grossCents), cols[6]); nl();
    tot.emp += s.employees; tot.reg += s.regHh; tot.ot += s.otHh; tot.tips += s.tipsCents + s.gratCents; tot.gross += s.grossCents;
  }
  text('Total', cols[0], 9.5, bold); right(String(tot.emp), cols[2], 9.5, bold); right(hoursPlain(tot.reg), cols[3], 9.5, bold); right(hoursPlain(tot.ot), cols[4], 9.5, bold);
  right(centsDisplay(tot.tips), cols[5], 9.5, bold); right(centsDisplay(tot.gross), cols[6], 9.5, bold); nl(22);

  const adjustments = detail.lines.filter((l) => l.source === 'manual_adjustment' || l.edited_at);
  text(`Adjustments and edits (${adjustments.length})`, 50, 11, bold); nl(16);
  for (const l of adjustments) {
    text(`${l.source === 'manual_adjustment' ? 'Added' : 'Edited'} ${l.earning_type} for ${l.toast_name} at ${locName(l.location_id)}: ${hoursPlain(l.hours_hh)} hrs, ${centsDisplay(l.amount_cents)}`, 56, 9); nl(12);
    for (const part of wrap(`Reason: ${l.adjustment_reason ?? ''}`, 110)) { text(part, 66, 8.5, font, rgb(0.3, 0.3, 0.3)); nl(11); }
    nl(3);
  }
  nl(6);
  const warnings = detail.flags.filter((f) => f.severity === 'warning');
  text(`Warnings acknowledged (${warnings.length})`, 50, 11, bold); nl(16);
  for (const f of warnings) {
    for (const part of wrap(f.message, 120)) { text(part, 56, 8.5); nl(11); }
    for (const part of wrap(`Note: ${f.resolution_note ?? '(not acknowledged)'}${f.resolved_by_name ? ` — ${f.resolved_by_name}` : ''}`, 110)) { text(part, 66, 8.5, font, rgb(0.3, 0.3, 0.3)); nl(11); }
    nl(3);
  }

  await log(supabase, 'download_summary', {}, id);
  return new NextResponse(Buffer.from(await doc.save()), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Payroll summary ${run.period_start} to ${run.period_end}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
