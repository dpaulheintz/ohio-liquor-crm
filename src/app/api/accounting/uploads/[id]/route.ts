import { NextResponse } from 'next/server';
import { getAccountingAccess } from '@/lib/fin/server';
import { FIN_BUCKET } from '@/lib/fin/shared';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Download an uploaded P&L export (short-lived signed URL; accounting access only).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = await createClient();
  const access = await getAccountingAccess(supabase);
  if (!access.allowed) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const { data: u } = await supabase.from('fin_uploads').select('file_path, file_name').eq('id', id).maybeSingle();
  if (!u?.file_path) return NextResponse.json({ error: 'No file for this upload' }, { status: 404 });
  const { data, error } = await supabase.storage.from(FIN_BUCKET).createSignedUrl(u.file_path, 60, { download: u.file_name ?? true });
  if (error || !data) return NextResponse.json({ error: 'File not available' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
