'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getAllAssignments,
  createAssignment,
  completeAssignment,
  deleteAssignment,
} from '@/app/actions/assignments';
import { getReps, searchAccounts } from '@/app/actions/accounts';
import { Assignment, Profile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Search,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatVisitDate } from '@/lib/date-utils';

type RepOption = Pick<Profile, 'id' | 'full_name' | 'email'>;
type AccountOption = { id: string; display_name: string; city: string | null; type: string };

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [reps, setReps] = useState<RepOption[]>([]);

  // New assignment dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newAccountSearch, setNewAccountSearch] = useState('');
  const [accountResults, setAccountResults] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);
  const [newRep, setNewRep] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAssignments({
        repId: repFilter !== 'all' ? repFilter : undefined,
        status: statusFilter,
      });
      setAssignments(result.assignments as unknown as Assignment[]);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [repFilter, statusFilter]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  useEffect(() => {
    getReps().then(setReps);
  }, []);

  // Account search with debounce
  useEffect(() => {
    if (!newAccountSearch.trim()) {
      setAccountResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchAccounts(newAccountSearch);
        setAccountResults(results as unknown as AccountOption[]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [newAccountSearch]);

  async function handleCreate() {
    if (!selectedAccount || !newRep) {
      toast.error('Select an account and a rep');
      return;
    }
    setSaving(true);
    try {
      await createAssignment({
        accountId: selectedAccount.id,
        assignedTo: newRep,
        notes: newNotes || undefined,
      });
      toast.success('Assignment created');
      setDialogOpen(false);
      setSelectedAccount(null);
      setNewAccountSearch('');
      setNewRep('');
      setNewNotes('');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to create assignment');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(id: string) {
    try {
      await completeAssignment(id);
      toast.success('Marked as complete');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to update assignment');
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAssignment(id);
      toast.success('Assignment removed');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to delete assignment');
      console.error(err);
    }
  }

  const pending = assignments.filter((a) => a.status === 'pending');
  const completed = assignments.filter((a) => a.status === 'completed');

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} total · {pending.length} pending
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Account search */}
              <div className="space-y-1.5">
                <Label>Account</Label>
                {selectedAccount ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span className="font-medium">{selectedAccount.display_name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedAccount(null)}
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search accounts..."
                      value={newAccountSearch}
                      onChange={(e) => setNewAccountSearch(e.target.value)}
                    />
                    {(accountResults.length > 0 || searchLoading) && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                        {searchLoading ? (
                          <div className="p-2 text-sm text-muted-foreground">Searching…</div>
                        ) : (
                          accountResults.map((acct) => (
                            <button
                              key={acct.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                              onClick={() => {
                                setSelectedAccount(acct);
                                setNewAccountSearch('');
                                setAccountResults([]);
                              }}
                            >
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{acct.display_name}</span>
                              {acct.city && (
                                <span className="text-muted-foreground text-xs">{acct.city}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Rep picker */}
              <div className="space-y-1.5">
                <Label>Assign To</Label>
                <Select value={newRep} onValueChange={setNewRep}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Context for the rep..."
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={saving || !selectedAccount || !newRep}>
                  {saving ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={repFilter} onValueChange={setRepFilter}>
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

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Assignment list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No assignments found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(statusFilter === 'all' || statusFilter === 'pending') && pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Pending ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    isAdmin
                  />
                ))}
              </div>
            </section>
          )}

          {(statusFilter === 'all' || statusFilter === 'completed') && completed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Completed ({completed.length})
              </h2>
              <div className="space-y-2">
                {completed.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    isAdmin
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  onComplete,
  onDelete,
  isAdmin = false,
}: {
  assignment: Assignment;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}) {
  const isDone = a.status === 'completed';
  const account = a.account as { id: string; display_name: string; city?: string | null } | undefined;
  const rep = a.rep as { id: string; full_name: string | null; email: string } | undefined;
  const assigner = a.assigner as { id: string; full_name: string | null; email: string } | undefined;

  return (
    <Card className={isDone ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {account ? (
                <Link
                  href={`/accounts/${account.id}`}
                  className="font-semibold text-sm hover:underline text-primary"
                >
                  {account.display_name}
                </Link>
              ) : (
                <span className="font-semibold text-sm">Unknown account</span>
              )}
              {account?.city && (
                <span className="text-xs text-muted-foreground">{account.city}</span>
              )}
              <Badge variant={isDone ? 'secondary' : 'default'} className="text-[10px]">
                {isDone ? 'Completed' : 'Pending'}
              </Badge>
            </div>

            {isAdmin && rep && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Assigned to <span className="font-medium">{rep.full_name || rep.email}</span>
                {assigner && (
                  <> · by {assigner.full_name || assigner.email}</>
                )}
              </p>
            )}

            {a.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>
            )}

            <p className="text-[10px] text-muted-foreground mt-1">
              {isDone && a.completed_at
                ? `Completed ${formatVisitDate(a.completed_at)}`
                : `Assigned ${formatVisitDate(a.created_at)}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isDone && onComplete && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => onComplete(a.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </Button>
            )}
            {isAdmin && onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
