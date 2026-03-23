'use client';

import { useState, useEffect, useCallback } from 'react';
import { getKpiSummary } from '@/app/actions/kpi';
import { getReps } from '@/app/actions/accounts';
import { KPI_OPTIONS, Profile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface KpiVisit {
  id: string;
  kpi: string;
  visited_at: string;
  notes: string | null;
  account?: { id: string; display_name: string };
  rep?: { id: string; full_name: string | null; email: string };
}

export default function KpiReportPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visits, setVisits] = useState<KpiVisit[]>([]);
  const [reps, setReps] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [repId, setRepId] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getKpiSummary({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        repId: repId !== 'all' ? repId : undefined,
      });
      setCounts(result.counts);
      setVisits(result.visits as KpiVisit[]);
    } catch (err) {
      console.error('KPI load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, repId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    getReps().then(setReps);
  }, []);

  const totalKpis = Object.values(counts).reduce((s, c) => s + c, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-6 w-6" />
        KPI Report
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rep</Label>
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Reps" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name || r.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{totalKpis}</p>
                <p className="text-xs text-muted-foreground">Total KPIs</p>
              </CardContent>
            </Card>
            {KPI_OPTIONS.map((kpi) => (
              <Card key={kpi}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{counts[kpi] || 0}</p>
                  <p className="text-xs text-muted-foreground">{kpi}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent KPI Visits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent KPI Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {visits.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No KPI-tagged visits found
                </p>
              ) : (
                <div className="space-y-2">
                  {visits.slice(0, 50).map((visit) => (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{visit.kpi}</Badge>
                          <span className="font-medium truncate">
                            {visit.rep?.full_name || visit.rep?.email}
                          </span>
                          {visit.account && (
                            <>
                              <span className="text-muted-foreground">at</span>
                              <Link
                                href={`/accounts/${visit.account.id}`}
                                className="text-primary hover:underline truncate"
                              >
                                {visit.account.display_name}
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatDistanceToNow(new Date(visit.visited_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
