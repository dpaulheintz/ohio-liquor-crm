import { NextRequest, NextResponse } from 'next/server';
import { getToastToken, toastGet, fetchMenuItemSales, fetchMetrics } from '@/lib/toast/client';

/**
 * GET /api/toast-debug?endpoint=/menus/v2/menus&restaurant=GUID
 * GET /api/toast-debug?type=menu&restaurant=GUID&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * GET /api/toast-debug?type=metrics&restaurant=GUID&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Debug endpoint: makes a raw Toast API call and returns the response.
 * ?type=menu    — tests item sales via Standard API orders (fetchMenuItemSales)
 * ?type=metrics — tests Analytics API metrics report (POST+poll) for one GUID
 */
export async function GET(request: NextRequest) {
  const syncSecret = process.env.SYNC_SECRET;
  const authHeader = request.headers.get('authorization');
  if (syncSecret && authHeader !== `Bearer ${syncSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const type = sp.get('type');
  const restaurant = sp.get('restaurant') ?? 'b5d9fdc1-ae0c-43d1-b7b8-ef097ff7b546'; // Grandview default
  const startDate = sp.get('startDate') ?? '2024-01-01';
  const endDate = sp.get('endDate') ?? '2024-01-07';

  // Analytics metrics test — POST+poll /era/v1/metrics for one GUID
  if (type === 'metrics') {
    try {
      const rows = await fetchMetrics([restaurant], startDate, endDate);
      return NextResponse.json({
        ok: true,
        type: 'metrics',
        restaurant,
        dateRange: `${startDate} → ${endDate}`,
        rowCount: rows.length,
        rows,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  // Menu item test — fetches item sales via Standard API /orders/v2/ordersBulk
  if (type === 'menu') {
    try {
      const rows = await fetchMenuItemSales([restaurant], startDate, endDate);
      return NextResponse.json({
        ok: true,
        type: 'menu',
        restaurant,
        dateRange: `${startDate} → ${endDate}`,
        rowCount: rows.length,
        fields: rows.length > 0 ? Object.keys(rows[0]) : [],
        preview: rows.slice(0, 10),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  }

  const endpoint = sp.get('endpoint') ?? '/menus/v2/menus';

  // Collect extra params to pass through
  const extraParams: Record<string, string> = {};
  for (const [k, v] of sp.entries()) {
    if (k !== 'endpoint' && k !== 'restaurant' && k !== 'type') extraParams[k] = v;
  }

  try {
    const token = await getToastToken();
    const tokenPreview = `${token.slice(0, 15)}...${token.slice(-8)}`;

    const raw = Object.keys(extraParams).length > 0
      ? await toastGet<unknown>(endpoint, restaurant, extraParams)
      : await toastGet<unknown>(endpoint, restaurant);

    const shape = {
      type: typeof raw,
      isArray: Array.isArray(raw),
      topKeys: raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.keys(raw as Record<string, unknown>) : null,
      arrayLength: Array.isArray(raw) ? (raw as unknown[]).length : null,
      preview: JSON.stringify(raw).slice(0, 15000),
    };

    return NextResponse.json({ ok: true, tokenPreview, endpoint, restaurant, shape });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
