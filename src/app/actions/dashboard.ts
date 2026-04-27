'use server';

import { createClient } from '@/lib/supabase/server';
import {
  startOfWeek,
  startOfMonth,
  subDays,
  subWeeks,
  subMonths,
  format,
  parseISO,
} from 'date-fns';

export interface DashboardData {
  kpiCards: {
    visitsThisWeek: number;
    visitsLastWeek: number;
    visitsThisMonth: number;
    visitsLastMonth: number;
    uniqueAccountsThisMonth: number;
    uniqueAccountsLastMonth: number;
    kpisThisMonth: number;
    kpisLastMonth: number;
    accountsNeedingReview: number;
  };
  dailyVisits7: { date: string; label: string; visits: number }[];
  dailyVisits30: { date: string; label: string; visits: number }[];
  kpiBreakdown: { name: string; count: number }[];
  repLeaderboard: {
    id: string;
    name: string;
    email: string;
    visitsThisWeek: number;
    visitsThisMonth: number;
    uniqueAccounts: number;
    lastActive: string | null;
  }[];
  recentActivity: {
    id: string;
    visitedAt: string;
    notes: string | null;
    kpi: string | null;
    kpiQuantity: number | null;
    repName: string | null;
    repEmail: string;
    accountId: string;
    accountName: string;
    photoCount: number;
    photoUrls: string[];
  }[];
}

interface RecentVisitRow {
  id: string;
  visited_at: string;
  notes: string | null;
  kpi: string | null;
  kpi_quantity: number | null;
  rep: { id: string; full_name: string | null; email: string } | null;
  account: { id: string; display_name: string } | null;
  visit_photos: { photo_url: string; sort_order: number }[] | null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const now = new Date();

  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const monthStart = startOfMonth(now);
  const prevWeekStart = subWeeks(weekStart, 1);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const sixtyDaysAgo = subDays(now, 60);

  const [visitsResult, repsResult, reviewCountResult, recentResult] =
    await Promise.all([
      supabase
        .from('visit_logs')
        .select('rep_id, visited_at, account_id, kpi')
        .gte('visited_at', sixtyDaysAgo.toISOString())
        .order('visited_at', { ascending: false }),

      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['rep', 'admin']),

      supabase
        .from('accounts')
        .select('id', { count: 'exact', head: true })
        .eq('needs_review', true),

      supabase
        .from('visit_logs')
        .select(
          'id, visited_at, notes, kpi, kpi_quantity, rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), account:accounts!visit_logs_account_id_fkey(id, display_name), visit_photos(*)'
        )
        .order('visited_at', { ascending: false })
        .limit(10),
    ]);

  const allVisits = visitsResult.data ?? [];
  const reps = repsResult.data ?? [];
  const accountsNeedingReview = reviewCountResult.count ?? 0;
  const recentVisits = recentResult.data ?? [];

  // --- KPI Cards ---
  const thisWeekVisits = allVisits.filter(
    (v) => new Date(v.visited_at) >= weekStart
  );
  const lastWeekVisits = allVisits.filter((v) => {
    const d = new Date(v.visited_at);
    return d >= prevWeekStart && d < weekStart;
  });
  const thisMonthVisits = allVisits.filter(
    (v) => new Date(v.visited_at) >= monthStart
  );
  const lastMonthVisits = allVisits.filter((v) => {
    const d = new Date(v.visited_at);
    return d >= prevMonthStart && d < monthStart;
  });

  const uniqueAccountsThisMonth = new Set(
    thisMonthVisits.map((v) => v.account_id)
  ).size;
  const uniqueAccountsLastMonth = new Set(
    lastMonthVisits.map((v) => v.account_id)
  ).size;

  const kpisThisMonth = thisMonthVisits.filter((v) => v.kpi).length;
  const kpisLastMonth = lastMonthVisits.filter((v) => v.kpi).length;

  // --- Daily Visits (last 7 days) ---
  const dailyVisits7 = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(now, i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const label = format(day, 'EEE');
    const count = allVisits.filter(
      (v) => format(parseISO(v.visited_at), 'yyyy-MM-dd') === dayStr
    ).length;
    dailyVisits7.push({ date: dayStr, label, visits: count });
  }

  // --- Daily Visits (last 30 days) ---
  const dailyVisits30 = [];
  for (let i = 29; i >= 0; i--) {
    const day = subDays(now, i);
    const dayStr = format(day, 'yyyy-MM-dd');
    const label = format(day, 'MMM d');
    const count = allVisits.filter(
      (v) => format(parseISO(v.visited_at), 'yyyy-MM-dd') === dayStr
    ).length;
    dailyVisits30.push({ date: dayStr, label, visits: count });
  }

  // --- KPI Breakdown (this month) ---
  const kpiCounts: Record<string, number> = {};
  for (const v of thisMonthVisits) {
    if (v.kpi) {
      kpiCounts[v.kpi] = (kpiCounts[v.kpi] || 0) + 1;
    }
  }
  const kpiBreakdown = ['Display', 'Menu', 'Feature', 'Event'].map(
    (name) => ({
      name,
      count: kpiCounts[name] || 0,
    })
  );

  // --- Rep Leaderboard ---
  const repLeaderboard = reps
    .map((rep) => {
      const repThisWeek = thisWeekVisits.filter(
        (v) => v.rep_id === rep.id
      ).length;
      const repThisMonth = thisMonthVisits.filter(
        (v) => v.rep_id === rep.id
      ).length;
      const repAccounts = new Set(
        thisMonthVisits
          .filter((v) => v.rep_id === rep.id)
          .map((v) => v.account_id)
      ).size;
      const repVisits = allVisits.filter((v) => v.rep_id === rep.id);
      const lastActive =
        repVisits.length > 0 ? repVisits[0].visited_at : null;

      return {
        id: rep.id,
        name: rep.full_name ?? rep.email,
        email: rep.email,
        visitsThisWeek: repThisWeek,
        visitsThisMonth: repThisMonth,
        uniqueAccounts: repAccounts,
        lastActive,
      };
    })
    .sort((a, b) => b.visitsThisMonth - a.visitsThisMonth);

  // --- Recent Activity ---
  const recentActivity = (recentVisits as RecentVisitRow[]).map((v) => {
    const photos = (v.visit_photos ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: v.id,
      visitedAt: v.visited_at,
      notes: v.notes,
      kpi: v.kpi,
      kpiQuantity: v.kpi_quantity ?? null,
      repName: v.rep?.full_name ?? null,
      repEmail: v.rep?.email ?? '',
      accountId: v.account?.id ?? '',
      accountName: v.account?.display_name ?? 'Unknown',
      photoCount: photos.length,
      photoUrls: photos.map((p) => p.photo_url),
    };
  });

  return {
    kpiCards: {
      visitsThisWeek: thisWeekVisits.length,
      visitsLastWeek: lastWeekVisits.length,
      visitsThisMonth: thisMonthVisits.length,
      visitsLastMonth: lastMonthVisits.length,
      uniqueAccountsThisMonth,
      uniqueAccountsLastMonth,
      kpisThisMonth,
      kpisLastMonth,
      accountsNeedingReview,
    },
    dailyVisits7,
    dailyVisits30,
    kpiBreakdown,
    repLeaderboard,
    recentActivity,
  };
}
