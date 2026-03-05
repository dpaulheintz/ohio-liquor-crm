'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRepActivity } from '@/app/actions/visits';
import { getUploadBatches } from '@/app/actions/csv-upload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  BarChart3,
  Upload,
  Users,
  AlertCircle,
  ClipboardCheck,
  MapPin,
} from 'lucide-react';
import Link from 'next/link';

interface RepStats {
  rep: {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  };
  visitsThisWeek: number;
  visitsThisMonth: number;
  accountsVisited: number;
  lastActive: string | null;
}

export default function AdminDashboard() {
  const [repStats, setRepStats] = useState<RepStats[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, batches] = await Promise.all([
        getRepActivity(),
        getUploadBatches(),
      ]);
      setRepStats(stats);
      setBatchCount(batches.length);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalVisitsWeek = repStats.reduce((s, r) => s + r.visitsThisWeek, 0);
  const totalVisitsMonth = repStats.reduce(
    (s, r) => s + r.visitsThisMonth,
    0
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{totalVisitsWeek}</p>
                <p className="text-xs text-muted-foreground">Visits This Week</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{totalVisitsMonth}</p>
                <p className="text-xs text-muted-foreground">Visits This Month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{repStats.length}</p>
                <p className="text-xs text-muted-foreground">Active Reps</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{batchCount}</p>
                <p className="text-xs text-muted-foreground">Data Uploads</p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Rep Activity */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Rep Activity
            </h2>
            {repStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No rep activity recorded yet.
              </p>
            ) : (
              <div className="space-y-2">
                {repStats.map((stat) => (
                  <Card key={stat.rep.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {(stat.rep.full_name || stat.rep.email || '?')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">
                          {stat.rep.full_name || stat.rep.email}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{stat.visitsThisWeek} this week</span>
                          <span>{stat.visitsThisMonth} this month</span>
                          <span>
                            <MapPin className="inline h-3 w-3 mr-0.5" />
                            {stat.accountsVisited} accounts
                          </span>
                        </div>
                      </div>
                      {stat.lastActive && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          Last:{' '}
                          {new Date(stat.lastActive).toLocaleDateString()}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Quick Links */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/admin/upload">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-primary" />
                    <span className="text-sm font-medium">Upload CSV</span>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/admin/unmatched">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6 text-orange-500" />
                    <span className="text-sm font-medium">Unmatched</span>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/admin/approvals">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <ClipboardCheck className="h-6 w-6 text-blue-500" />
                    <span className="text-sm font-medium">Approvals</span>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/admin/users">
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <Users className="h-6 w-6 text-green-500" />
                    <span className="text-sm font-medium">Users</span>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
