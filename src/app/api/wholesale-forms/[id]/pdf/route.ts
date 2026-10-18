import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWholesaleAccess, loadForm, loadSettings } from '@/lib/wholesale-forms-server';
import { renderWholesaleFormPdf } from '@/lib/wholesale-forms-pdf';
import { pdfFileName } from '@/lib/wholesale-forms';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /api/* skips the auth proxy, so access is checked here (and again by RLS on every read).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.canUse) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const [form, settings] = await Promise.all([loadForm(supabase, id), loadSettings(supabase)]);
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rendered from the form's own snapshot (recipient, prices, A-3a info), so re-downloads match what was recorded.
  const bytes = await renderWholesaleFormPdf(form, form.settings_snapshot ?? settings);
  const filename = pdfFileName(form.sales_date, form.recipient_name);
  const disposition = req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment';

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
