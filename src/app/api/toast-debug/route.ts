import { NextRequest, NextResponse } from 'next/server';
import { getToastToken, toastGet } from '@/lib/toast/client';

/**
 * GET /api/toast-debug?endpoint=/menus/v2/menus&restaurant=GUID
 *
 * Debug endpoint: makes a raw Toast API call and returns the response.
 * Shows the first 5000 chars to inspect response shapes.
 */
export async function GET(request: NextRequest) {
  const syncSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get('authorization');
  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const endpoint = sp.get('endpoint') ?? '/menus/v2/menus';
  const restaurant = sp.get('restaurant') ?? 'b5d9fdc1-ae0c-43d1-b7b8-ef097ff7b546'; // Grandview default

  try {
    // Test auth first
    const token = await getToastToken();
    const tokenPreview = `${token.slice(0, 15)}...${token.slice(-8)}`;

    // Make the raw call
    const raw = await toastGet<unknown>(endpoint, restaurant);

    // Inspect shape
    const shape = {
      type: typeof raw,
      isArray: Array.isArray(raw),
      topKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw as Record<string, unknown>) : null,
      arrayLength: Array.isArray(raw) ? (raw as unknown[]).length : null,
      preview: JSON.stringify(raw).slice(0, 5000),
    };

    return NextResponse.json({ ok: true, tokenPreview, endpoint, restaurant, shape });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
