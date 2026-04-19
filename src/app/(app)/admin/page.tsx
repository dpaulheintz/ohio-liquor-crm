'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDashboardData, type DashboardData } from '@/app/actions/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Target,
  Users,
  Eye,
  FileUp,
  ClipboardCheck,
  BarChart3,
  MapPin,
  CalendarDays,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { formatVisitDate } from '@/lib/date-utils';
import { PhotoAudit } from './photo-audit';

// ---------- Chart configs ----------

const barChartConfig = {
  visits: {
    label: 'Visits',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

const areaChartConfig = {
  visits: {
    label: 'Visits',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

const kpiChartConfig = {
  Display: { label: 'Display', color: 'var(--chart-1)' },
  Menu: { label: 'Menu', color: 'var(--chart-2)' },
  Feature: { label: 'Feature', color: 'var(--chart-3)' },
  Event: { label: 'Event', color: 'var(--chart-4)' },
} satisfies ChartConfig;

// ---------- Helpers ----------

function TrendBadge({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  if (previous === 0 && current === 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> --
      </span>
    );

  if (previous === 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-600">
        <TrendingUp className="h-3 w-3" /> New
      </span>
    );

  const pct = Math.round(((current - previous) / previous) * 100);

  if (pct > 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-600">
        <TrendingUp className="h-3 w-3" /> +{pct}%
      </span>
    );

  if (pct < 0)
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-500">
        <TrendingDown className="h-3 w-3" /> {pct}%
      </span>
    );

  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" /> 0%
    </span>
  );
}

// ---------- Skeleton loader ----------

function DashboardSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <Skeleton className="h-8 w-56" />

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-10" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[200px] w-full rounded-md" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-[200px] w-full rounded-md" />
          </CardContent>
        </Card>
      </div>

      {/* KPI + Leaderboard skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-[180px] w-full rounded-md" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Activity skeleton */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Main Dashboard ----------

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDashboardData();
      setData(result);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) return <DashboardSkeleton />;

  const { kpiCards, dailyVisits7, dailyVisits30, kpiBreakdown, repLeaderboard, recentActivity } =
    data;

  const kpiTotal = kpiBreakdown.reduce((s, k) => s + k.count, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Sales Dashboard</h1>

      {/* ========== 1. Hero KPI Cards ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" /> Visits This Week
            </p>
            <p className="text-3xl font-bold mt-1">{kpiCards.visitsThisWeek}</p>
            <TrendBadge
              current={kpiCards.visitsThisWeek}
              previous={kpiCards.visitsLastWeek}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Visits This Month
            </p>
            <p className="text-3xl font-bold mt-1">
              {kpiCards.visitsThisMonth}
            </p>
            <TrendBadge
              current={kpiCards.visitsThisMonth}
              previous={kpiCards.visitsLastMonth}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Accounts Touched
            </p>
            <p className="text-3xl font-bold mt-1">
              {kpiCards.uniqueAccountsThisMonth}
            </p>
            <TrendBadge
              current={kpiCards.uniqueAccountsThisMonth}
              previous={kpiCards.uniqueAccountsLastMonth}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> KPIs Logged
            </p>
            <p className="text-3xl font-bold mt-1">{kpiCards.kpisThisMonth}</p>
            <TrendBadge
              current={kpiCards.kpisThisMonth}
              previous={kpiCards.kpisLastMonth}
            />
          </CardContent>
        </Card>

        <Card className={kpiCards.accountsNeedingReview > 0 ? 'border-amber-400/50' : ''}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Eye className="h-3 w-3" /> Needs Review
            </p>
            <p className="text-3xl font-bold mt-1">
              {kpiCards.accountsNeedingReview}
            </p>
            {kpiCards.accountsNeedingReview > 0 ? (
              <Link
                href="/admin/approvals"
                className="text-xs text-amber-600 hover:underline"
              >
                View queue
              </Link>
            ) : (
              <span className="text-xs text-emerald-600">All clear</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ========== 2 & 3. Charts Row ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 7-Day Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Visits &mdash; Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ChartContainer config={barChartConfig} className="h-[220px] w-full">
              <BarChart data={dailyVisits7} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={28}
                />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                />
                <Bar
                  dataKey="visits"
                  fill="var(--color-visits)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* 30-Day Area Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Visits &mdash; Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ChartContainer
              config={areaChartConfig}
              className="h-[220px] w-full"
            >
              <AreaChart data={dailyVisits30} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={28}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <defs>
                  <linearGradient id="fillVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-visits)"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-visits)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="visits"
                  type="monotone"
                  fill="url(#fillVisits)"
                  stroke="var(--color-visits)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ========== 4 & 5. KPI Breakdown + Rep Leaderboard ========== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KPI Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" /> KPI Breakdown (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpiTotal === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No KPIs logged this month
              </p>
            ) : (
              <ChartContainer
                config={kpiChartConfig}
                className="h-[200px] w-full"
              >
                <BarChart
                  data={kpiBreakdown}
                  layout="vertical"
                  accessibilityLayer
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    width={60}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {kpiBreakdown.map((entry) => {
                      const cfg =
                        kpiChartConfig[
                          entry.name as keyof typeof kpiChartConfig
                        ];
                      return (
                        <Cell
                          key={entry.name}
                          fill={cfg?.color ?? 'var(--chart-1)'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Rep Leaderboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Rep Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repLeaderboard.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No rep activity yet
              </p>
            ) : (
              <div className="space-y-2">
                {repLeaderboard.map((rep, idx) => (
                  <div
                    key={rep.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      idx === 0 ? 'bg-amber-50/50 border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-800/30' : ''
                    }`}
                  >
                    <span className="text-sm font-bold text-muted-foreground w-5 text-right shrink-0">
                      {idx + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {(rep.name || rep.email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {rep.name}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{rep.visitsThisWeek} wk</span>
                        <span>{rep.visitsThisMonth} mo</span>
                        <span>
                          <MapPin className="inline h-3 w-3 mr-0.5" />
                          {rep.uniqueAccounts}
                        </span>
                      </div>
                    </div>
                    {rep.lastActive && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {formatDistanceToNow(new Date(rep.lastActive), {
                          addSuffix: true,
                        })}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* ========== 5.5 Photo Audit ========== */}
      <PhotoAudit />

      <Separator />

      {/* ========== 6. Recent Activity Feed ========== */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No visits recorded yet
            </p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((visit) => (
                <div
                  key={visit.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {(visit.repName || visit.repEmail)[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {visit.repName || visit.repEmail}
                      </span>
                      <span className="text-xs text-muted-foreground">at</span>
                      <Link
                        href={`/accounts/${visit.accountId}`}
                        className="text-sm text-primary hover:underline truncate"
                      >
                        {visit.accountName}
                      </Link>
                      {visit.kpi && (
                        <Badge variant="secondary" className="text-[10px]">
                          {visit.kpi}{visit.kpiQuantity && visit.kpiQuantity > 1 ? ` ×${visit.kpiQuantity}` : ''}
                        </Badge>
                      )}
                    </div>
                    {visit.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {visit.notes}
                      </p>
                    )}
                    {visit.photoUrls.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5">
                        {visit.photoUrls.slice(0, 3).map((url: string, i: number) => (
                          <img
                            key={i}
                            src={url}
                            alt={`Visit photo ${i + 1}`}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ))}
                        {visit.photoUrls.length > 3 && (
                          <span className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                            +{visit.photoUrls.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatVisitDate(visit.visitedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ========== 7. Quick Actions ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/admin/import">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <FileUp className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium">Import Agencies</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/approvals">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <span className="text-xs font-medium">Approvals</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/kpi">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-500" />
              <span className="text-xs font-medium">KPI Report</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              <span className="text-xs font-medium">Users</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
