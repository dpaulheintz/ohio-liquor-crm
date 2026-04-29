import { getOrgDetail, startImpersonation } from '@/app/actions/super-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Activity, Building2, Users, Eye } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OrgToggleButton } from '../org-toggle-button';
import { ImpersonateButton } from './impersonate-button';

type RecentVisitRow = {
  id: string;
  visited_at: string;
  notes: string | null;
  kpi: string | null;
  rep: { full_name: string | null; email: string } | null;
  account: { display_name: string } | null;
};

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getOrgDetail(id);
  } catch {
    notFound();
  }

  const { org, users, totalVisits, visitsThisWeek, visitsThisMonth, accountCount, recentVisits } = detail;

  const admins = users.filter((u) => u.role === 'admin');
  const reps = users.filter((u) => u.role === 'rep');
  const pending = users.filter((u) => u.role === 'pending' || !u.is_approved);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <Link
        href="/super-admin/organizations"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Organizations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">{org.name}</h2>
            <Badge variant={org.is_active ? 'default' : 'secondary'}>
              {org.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">/{org.slug}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ImpersonateButton orgId={org.id} orgName={org.name} />
          <OrgToggleButton orgId={org.id} isActive={org.is_active} orgName={org.name} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{users.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{accountCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{visitsThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Visits (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{visitsThisWeek}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Visits (7d)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Users */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">No users yet</p>
            )}
            {users.map((u) => {
              const initials = (u.full_name || u.email)?.[0]?.toUpperCase() ?? '?';
              return (
                <div key={u.id} className="flex items-center gap-3">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{u.full_name || u.email}</p>
                    {u.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    )}
                  </div>
                  <Badge
                    variant={
                      u.role === 'admin' ? 'default' : u.role === 'rep' ? 'secondary' : 'outline'
                    }
                    className="text-xs shrink-0"
                  >
                    {u.role}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Visits ({totalVisits} total)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentVisits.length === 0 && (
              <p className="text-sm text-muted-foreground">No visits yet</p>
            )}
            {(recentVisits as unknown as RecentVisitRow[]).map((v) => (
              <div key={v.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate max-w-[60%]">
                    {v.account?.display_name ?? 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.visited_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.rep?.full_name ?? v.rep?.email ?? 'Unknown rep'}
                  {v.kpi && ` · ${v.kpi}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
