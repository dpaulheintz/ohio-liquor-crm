import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWholesaleAccess, loadForm, renderFormPdf } from '@/lib/wholesale-forms-server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /api/* skips the auth proxy, so access is checked here (and again by RLS on every read).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = await createClient();
  const access = await getWholesaleAccess(supabase);
  if (!access.userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.canUse) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const form = await loadForm(supabase, id);
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rendered from the form's own snapshot (recipient, prices, A-3a info), so re-downloads match what was recorded.
  const { bytes, filename } = await renderFormPdf(supabase, form);
  const disposition = req.nextUrl.searchParams.get('inline') === '1' ? 'inline' : 'attachment';

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
