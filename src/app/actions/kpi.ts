'use server';

import { createAdminClient } from '@/lib/supabase/server';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date)   { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

/** Previous complete Mon–Sun week */
function getLastWeekRange(): [string, string] {
  const today = new Date();
  const dow   = today.getDay(); // 0=Sun
  const daysToLastSun = dow === 0 ? 7 : dow;
  const lastSun = new Date(today); lastSun.setDate(today.getDate() - daysToLastSun);
  const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
  return [fmt(lastMon), fmt(lastSun)];
}

function getPrevWeekRange(lastMonStr: string): [string, string] {
  const d = new Date(lastMonStr + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  const prevSun = new Date(d); prevSun.setDate(d.getDate() + 6);
  return [fmt(d), fmt(prevSun)];
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function lastMonthStr(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;
}
function monthStart(ym: string): string { return `${ym}-01`; }
function monthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const last   = new Date(y, m, 0);
  return fmt(last);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiEventRow {
  id:               string;
  visit_id:         string;
  visited_at:       string;
  kpi:              string;
  kpi_quantity:     number;
  sold_status:      'sold' | 'unsold';
  display_type:     string | null;
  notes:            string | null;
  visit_type:       'in_person' | 'phone_call';
  rep_id:           string;
  rep_name:         string | null;
  rep_email:        string;
  account_id:       string;
  account_name:     string;
  account_city:     string | null;
  account_agency_id: string | null;
  photo_count:      number;
  photo_urls:       string[];
}

export interface WeeklyMetrics {
  weekStart:           string; // YYYY-MM-DD
  weekEnd:             string;
  whiskyEvents:        number;
  whiskyEventsPrior:   number;
  whiskyFeatures:      number;
  whiskyFeaturesPrior: number;
  activeDisplays:      number; // current month
  activeDisplaysPrior: number; // last month
  tastings:            number;
  tastingsPrior:       number;
}

export interface AgencyDisplayRow {
  id:               string;
  account_id:       string;
  agency_name:      string;
  rep_id:           string;
  rep_name:         string | null;
  rep_email:        string;
  display_type:     string;
  first_confirmed:  string | null;
  /** merged: historical overrides + live-computed for recent months */
  monthly_status:   Record<string, 'up' | 'down'>;
  account_city:     string | null;
  account_agency_id: string | null;
  latest_photo_url: string | null;
  latest_visit_date: string | null;
}

export interface KpiDashboardData {
  kpiEvents:        KpiEventRow[];
  totalVisitCount:  number;
  weeklyMetrics:    WeeklyMetrics;
  agencyDisplays:   AgencyDisplayRow[];
}

// ─── Server actions ───────────────────────────────────────────────────────────

export async function getAccountDisplay(accountId: string): Promise<{ display_type: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('agency_displays')
    .select('id, display_type')
    .eq('account_id', accountId)
    .single();
  return data ? { display_type: String(data.display_type) } : null;
}

export async function getKpiDashboardData(): Promise<KpiDashboardData> {
  const supabase = createAdminClient();

  const [weekStart, weekEnd] = getLastWeekRange();
  const [priorStart, priorEnd] = getPrevWeekRange(weekStart);
  const curMonth  = currentMonthStr();
  const prevMonth = lastMonthStr();

  // Step 1: Fetch displays first — need account_ids before querying visits
  const displaysResult = await supabase
    .from('agency_displays')
    .select(`
      id, account_id, agency_name, rep_id, display_type, first_confirmed,
      monthly_status, notes,
      rep:profiles!agency_displays_rep_id_fkey(id, full_name, email),
      account:accounts!agency_displays_account_id_fkey(id, city, agency_id)
    `);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const displayAccountIds = (displaysResult.data ?? []).map((d: any) => String(d.account_id));

  // Step 2: All other queries in parallel, including full visit history for display accounts
  const [
    eventResult,
    countResult,
    weekEventsResult,
    priorEventsResult,
    weekTastingsResult,
    priorTastingsResult,
    visitsForDisplaysResult,
  ] = await Promise.all([
    // ── All KPI events ──────────────────────────────────────────────────────
    supabase
      .from('visit_kpis')
      .select(`
        id,
        kpi_type,
        kpi_quantity,
        sold_status,
        display_type,
        visit:visit_logs!visit_kpis_visit_id_fkey(
          id,
          visited_at,
          notes,
          visit_type,
          account_id,
          rep_id,
          account:accounts!visit_logs_account_id_fkey(id, display_name, city, agency_id),
          rep:profiles!visit_logs_rep_id_fkey(id, full_name, email),
          visit_photos(id, photo_url)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5000),

    // ── Total visit count ───────────────────────────────────────────────────
    supabase.from('visit_logs').select('*', { count: 'exact', head: true }),

    // ── Last week KPI events (for whisky events/features counts) ────────────
    supabase
      .from('visit_kpis')
      .select(`id, kpi_type, visit:visit_logs!visit_kpis_visit_id_fkey(visited_at)`)
      .gte('created_at', weekStart)
      .lte('created_at', weekEnd + 'T23:59:59Z'),

    // ── Prior week KPI events ───────────────────────────────────────────────
    supabase
      .from('visit_kpis')
      .select(`id, kpi_type, visit:visit_logs!visit_kpis_visit_id_fkey(visited_at)`)
      .gte('created_at', priorStart)
      .lte('created_at', priorEnd + 'T23:59:59Z'),

    // ── Last week tastings ──────────────────────────────────────────────────
    supabase
      .from('tastings')
      .select('id')
      .gte('date', weekStart)
      .lte('date', weekEnd),

    // ── Prior week tastings ─────────────────────────────────────────────────
    supabase
      .from('tastings')
      .select('id')
      .gte('date', priorStart)
      .lte('date', priorEnd),

    // ── All in-person visits to display accounts (for computing monthly status) ─
    // New logic: visit + Display KPI → UP; visit + no Display KPI → DOWN; no visit → assume UP
    displayAccountIds.length > 0
      ? supabase
          .from('visit_logs')
          .select(`
            id, account_id, visited_at,
            visit_kpis(id, kpi_type),
            visit_photos(id, photo_url)
          `)
          .in('account_id', displayAccountIds)
          .eq('visit_type', 'in_person')
          .gte('visited_at', '2024-01-01T00:00:00Z')
          .order('visited_at', { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  if (eventResult.error)  throw new Error(`KPI fetch failed: ${eventResult.error.message}`);
  if (countResult.error)  throw new Error(`Count failed: ${countResult.error.message}`);

  // ── Map KPI events ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kpiEvents: KpiEventRow[] = (eventResult.data ?? []).map((r: any) => {
    const v = r.visit;
    return {
      id:               String(r.id),
      visit_id:         String(v?.id ?? ''),
      visited_at:       String(v?.visited_at ?? ''),
      kpi:              String(r.kpi_type),
      kpi_quantity:     Number(r.kpi_quantity ?? 1),
      sold_status:      (r.sold_status ?? 'sold') as 'sold' | 'unsold',
      display_type:     r.display_type ? String(r.display_type) : null,
      notes:            v?.notes ? String(v.notes) : null,
      visit_type:       (v?.visit_type ?? 'in_person') as 'in_person' | 'phone_call',
      rep_id:           String(v?.rep_id ?? ''),
      rep_name:         v?.rep?.full_name ? String(v.rep.full_name) : null,
      rep_email:        String(v?.rep?.email ?? ''),
      account_id:       String(v?.account_id ?? ''),
      account_name:     String(v?.account?.display_name ?? 'Unknown'),
      account_city:     v?.account?.city ? String(v.account.city) : null,
      account_agency_id: v?.account?.agency_id ? String(v.account.agency_id) : null,
      photo_count:      Array.isArray(v?.visit_photos) ? v.visit_photos.length : 0,
      photo_urls:       Array.isArray(v?.visit_photos) ? v.visit_photos.map((p: any) => String(p.photo_url)) : [],
    };
  });

  // ── Weekly metrics ────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countKpi(rows: any[], types: string[]) {
    return (rows ?? []).filter((r: any) => types.includes(r.kpi_type)).length;
  }
  const weekRows  = weekEventsResult.data  ?? [];
  const priorRows = priorEventsResult.data ?? [];

  const whiskyEvents        = countKpi(weekRows,  ['Event']);
  const whiskyEventsPrior   = countKpi(priorRows, ['Event']);
  const whiskyFeatures      = countKpi(weekRows,  ['Menu', 'Feature']);
  const whiskyFeaturesPrior = countKpi(priorRows, ['Menu', 'Feature']);
  const tastings            = weekTastingsResult.data?.length  ?? 0;
  const tastingsPrior       = priorTastingsResult.data?.length ?? 0;

  // ── Build per-account visit data for display status computation ───────────
  // For each account: monthly map of { hasVisit, hasDisplayKpi } + latest Display KPI photo
  type MonthEntry = { hasVisit: boolean; hasDisplayKpi: boolean };
  type AcctVisitData = {
    monthly: Map<string, MonthEntry>;
    latestDisplayPhotoUrl: string | null;
    latestDisplayPhotoDate: string | null;
  };
  const acctVisitMap = new Map<string, AcctVisitData>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const visit of (visitsForDisplaysResult.data ?? []) as any[]) {
    const accountId = String(visit.account_id);
    const month = (visit.visited_at as string).slice(0, 7); // 'YYYY-MM'

    if (!acctVisitMap.has(accountId)) {
      acctVisitMap.set(accountId, { monthly: new Map(), latestDisplayPhotoUrl: null, latestDisplayPhotoDate: null });
    }
    const acctData = acctVisitMap.get(accountId)!;
    const entry = acctData.monthly.get(month) ?? { hasVisit: false, hasDisplayKpi: false };
    entry.hasVisit = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasDisplayKpi = Array.isArray(visit.visit_kpis) && visit.visit_kpis.some((k: any) => k.kpi_type === 'Display');
    if (hasDisplayKpi) {
      entry.hasDisplayKpi = true;
      // Track latest photo from Display KPI visits
      const photos: any[] = visit.visit_photos ?? [];
      if (photos.length > 0 && (!acctData.latestDisplayPhotoDate || visit.visited_at > acctData.latestDisplayPhotoDate)) {
        acctData.latestDisplayPhotoUrl = String(photos[0].photo_url);
        acctData.latestDisplayPhotoDate = String(visit.visited_at);
      }
    }
    acctData.monthly.set(month, entry);
  }

  // ── Build agency display rows ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agencyDisplays: AgencyDisplayRow[] = (displaysResult.data ?? []).map((d: any) => {
    // Start from stored monthly_status (covers months with no visit data)
    const ms: Record<string, 'up' | 'down'> = { ...(d.monthly_status ?? {}) };
    const acctData = acctVisitMap.get(String(d.account_id));

    if (acctData) {
      // Override with visit-derived status for every month we have data
      for (const [month, entry] of acctData.monthly.entries()) {
        if (entry.hasVisit) {
          // visit + Display KPI → UP; visit + no Display KPI → DOWN
          ms[month] = entry.hasDisplayKpi ? 'up' : 'down';
        }
        // No visit that month → leave stored value (defaults UP if absent)
      }
    }

    return {
      id:               String(d.id),
      account_id:       String(d.account_id),
      agency_name:      String(d.agency_name),
      rep_id:           String(d.rep_id ?? ''),
      rep_name:         d.rep?.full_name ? String(d.rep.full_name) : null,
      rep_email:        String(d.rep?.email ?? ''),
      display_type:     String(d.display_type),
      first_confirmed:  d.first_confirmed ? String(d.first_confirmed) : null,
      monthly_status:   ms,
      account_city:     d.account?.city ? String(d.account.city) : null,
      account_agency_id: d.account?.agency_id ? String(d.account.agency_id) : null,
      latest_photo_url:  acctData?.latestDisplayPhotoUrl ?? null,
      latest_visit_date: acctData?.latestDisplayPhotoDate ?? null,
    };
  });

  // ── Active display counts ─────────────────────────────────────────────────
  // Active = all tracked displays except those confirmed DOWN this month
  const activeDisplays      = agencyDisplays.filter(d => d.monthly_status[curMonth]  !== 'down').length;
  const activeDisplaysPrior = agencyDisplays.filter(d => d.monthly_status[prevMonth] !== 'down').length;

  const weeklyMetrics: WeeklyMetrics = {
    weekStart, weekEnd,
    whiskyEvents, whiskyEventsPrior,
    whiskyFeatures, whiskyFeaturesPrior,
    activeDisplays, activeDisplaysPrior,
    tastings, tastingsPrior,
  };

  return {
    kpiEvents,
    totalVisitCount: countResult.count ?? 0,
    weeklyMetrics,
    agencyDisplays,
  };
}
