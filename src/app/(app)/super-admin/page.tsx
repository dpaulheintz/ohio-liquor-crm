import { getGlobalStats } from '@/app/actions/super-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, ClipboardList, Layers, Activity } from 'lucide-react';
import Link from 'next/link';

export default async function SuperAdminOverviewPage() {
  const stats = await getGlobalStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Platform Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          High-level metrics across all organizations — last 30 days.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.activeOrgs}</p>
            <p className="text-xs text-muted-foreground">Active Orgs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <Users className="h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalUsers}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalVisits}</p>
            <p className="text-xs text-muted-foreground">Visits (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalAgencies}</p>
            <p className="text-xs text-muted-foreground">Shared Agencies</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-org breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Organizations Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {stats.orgsBreakdown.map((org) => (
              <Link
                key={org.id}
                href={`/super-admin/organizations/${org.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-sm">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </div>
                  {!org.is_active && (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="text-center hidden sm:block">
                    <p className="font-medium text-foreground">{org.userCount}</p>
                    <p className="text-xs">users</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">{org.visitCount}</p>
                    <p className="text-xs">visits</p>
                  </div>
                  <div className="text-center hidden sm:block">
                    <p className="font-medium text-foreground">{org.accountCount}</p>
                    <p className="text-xs">accounts</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
