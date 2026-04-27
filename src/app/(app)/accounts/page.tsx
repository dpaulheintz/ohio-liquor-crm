'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { startOfMonth } from 'date-fns';
import { getAccounts, getDistricts, getReps } from '@/app/actions/accounts';
import { Account, Profile } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Building2, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { AccountFormDialog } from './account-form-dialog';

export default function AccountsPage() {
  return (
    <Suspense fallback={
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    }>
      <AccountList />
    </Suspense>
  );
}

function AccountList() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // `touched=month` → show only accounts visited this month
  const touchedParam = searchParams.get('touched');
  const visitedSince = touchedParam === 'month'
    ? startOfMonth(new Date()).toISOString()
    : undefined;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('all');
  const [district, setDistrict] = useState<string>('all');
  const [repId, setRepId] = useState<string>('all');
  const [neverVisited, setNeverVisited] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [page, setPage] = useState(1);
  const [districts, setDistricts] = useState<string[]>([]);
  const [reps, setReps] = useState<Pick<Profile, 'id' | 'full_name' | 'email'>[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const pageSize = 20;

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAccounts({
        search: search || undefined,
        type: type !== 'all' ? (type as 'agency' | 'wholesale') : undefined,
        district: district !== 'all' ? district : undefined,
        repId: repId !== 'all' ? repId : undefined,
        neverVisited,
        visitedSince,
        needsReview,
        page,
        pageSize,
      });
      setAccounts(result.accounts);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [search, type, district, repId, neverVisited, visitedSince, needsReview, page]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    getDistricts().then(setDistricts);
    getReps().then(setReps);
  }, []);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Accounts</h1>
          {visitedSince && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Touched This Month
              <button
                onClick={() => router.replace('/accounts')}
                className="hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, city, agency ID, permit..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="agency">Agency</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
            </SelectContent>
          </Select>

          <Select value={district} onValueChange={(v) => { setDistrict(v); setPage(1); }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="District" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Districts</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={repId} onValueChange={(v) => { setRepId(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Rep" />
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

          <Button
            variant={neverVisited ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setNeverVisited(!neverVisited); setPage(1); }}
          >
            Never Visited
          </Button>

          <Button
            variant={needsReview ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setNeedsReview(!needsReview); setPage(1); }}
          >
            Needs Review
          </Button>
        </div>
      </div>

      {/* Account List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-10 w-10" />
          {visitedSince ? (
            <>
              <p>No accounts visited this month yet</p>
              <button
                onClick={() => router.replace('/accounts')}
                className="text-sm mt-2 underline hover:text-foreground"
              >
                Clear filter
              </button>
            </>
          ) : (
            <p>No accounts found</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/accounts/${account.id}`}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {account.display_name}
                  </span>
                  <Badge variant={account.type === 'agency' ? 'default' : 'secondary'} className="shrink-0 text-xs">
                    {account.type === 'agency' ? 'Agency' : 'Wholesale'}
                  </Badge>
                  {account.type === 'wholesale' && account.status === 'prospect' && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Prospect
                    </Badge>
                  )}
                  {account.needs_review && (
                    <Badge variant="destructive" className="shrink-0 text-xs">
                      Review
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {account.district && <span>{account.district}</span>}
                  {account.city && <span>{account.city}</span>}
                  {account.agency_id && <span>ID: {account.agency_id}</span>}
                  {account.permit_number && <span>Permit: {account.permit_number}</span>}
                </div>
              </div>
              {account.owner_rep && (
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {account.owner_rep.full_name || account.owner_rep.email}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 pb-20">
          <p className="text-sm text-muted-foreground">
            {total} account{total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <AccountFormDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={fetchAccounts}
      />
    </div>
  );
}
