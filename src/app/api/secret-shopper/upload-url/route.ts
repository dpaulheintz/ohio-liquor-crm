import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ipHashFromHeaders, rateLimitCount, recordRateEvent } from '@/lib/secret-shopper-server';
import { MEDIA_BUCKET, MEDIA_LIMITS, SECTION_KEYS, isUuid, storagePathPrefix, type SectionKey } from '@/lib/secret-shopper';

const UPLOADS_PER_HOUR = 40;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'video/x-m4v': 'm4v',
};

export async function POST(request: NextRequest) {
  let body: { visitId?: unknown; section?: unknown; mediaType?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { visitId, section, mediaType, contentType, size } = body;
  if (!isUuid(visitId)) return NextResponse.json({ error: 'Invalid visit' }, { status: 400 });
  if (section !== null && !SECTION_KEYS.includes(section as SectionKey)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  }
  if (mediaType !== 'photo' && mediaType !== 'video') {
    return NextResponse.json({ error: 'Invalid media type' }, { status: 400 });
  }
  const type = typeof contentType === 'string' ? contentType.toLowerCase() : '';
  if (!type.startsWith(mediaType === 'photo' ? 'image/' : 'video/')) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  const maxBytes = mediaType === 'photo' ? MEDIA_LIMITS.maxPhotoBytes : MEDIA_LIMITS.maxVideoBytes;
  if (typeof size !== 'number' || size <= 0 || size > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)` }, { status: 400 });
  }

  const ipHash = ipHashFromHeaders(request.headers);
  if ((await rateLimitCount(ipHash, 'upload', 60 * 60 * 1000)) >= UPLOADS_PER_HOUR) {
    return NextResponse.json({ error: 'Too many uploads. Please try again later.' }, { status: 429 });
  }

  const ext = EXT_BY_TYPE[type] ?? ((type.split('/')[1] ?? '').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin');
  const path = `${storagePathPrefix(visitId)}${section ?? 'general'}-${randomUUID()}.${ext}`;

  const { data, error } = await createAdminClient().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('secret-shopper signed upload url failed:', error);
    return NextResponse.json({ error: 'Upload unavailable. Please try again.' }, { status: 500 });
  }

  await recordRateEvent(ipHash, 'upload');
  return NextResponse.json({ signedUrl: data.signedUrl, path });
}
